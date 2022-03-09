// @ts-check
import {ParallelSystem, System, addComponent, component, create, defaultWorkers, initWorkers, query, setMaxEntities, removeComponent} from "./dist/index.js"
import {f, rand as g} from "./demoimport.js"

const n = 1e3

setMaxEntities(n * 2)

const cid = component()
const ca = new Uint32Array(new SharedArrayBuffer(4 * n)).fill(1)

const q = query(cid)

for(let i = 0; i < n; i++) {
  let e = create()
  addComponent(e, cid)
}

function sys(e) {
  for(let i = 0; i < f(); i++) {
    ca[e] += g()
  }
}

const parallel = ParallelSystem({q, ca, cid, import: {
  "./demoimport.js": [
    "f",
    ["rand", "g"],
  ],
}}, sys, {
  filepath: import.meta.url,
})

const sequential = System({q, ca, cid, f, g}, sys)

await initWorkers(4)

for(let _ = 0; _ < 10; _++) {

  console.time("parallel")
  for(let i = 0; i < 1e3; i++) {
    await parallel()
  }
  console.timeEnd("parallel")

  console.time("sequential")
  for(let i = 0; i < 1e3; i++) {
    sequential()
  }
  console.timeEnd("sequential")

}

defaultWorkers.terminate()
