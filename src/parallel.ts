import { createRequire } from "module"
import { Worker } from "worker_threads"
import { DynamicInt32Array, DynamicUint32Array, SharedInt32Array, SharedUint32Array } from "./array"

declare global {
  interface Atomics {
    waitAsync(typedArray: Int32Array, index: number, value: number, timeout?: number): {value: Promise<any>}
  }
}

export type NumFunc = (n: number) => any
export type CtxObj = {[k: string]: any, import: {[K: string]: [string, string][]}}
export type Opts = {
  each?: string,
  before?: string,
  after?: string,
  filepath?: string,
}

export type TaskSpec = [CtxObj, NumFunc, Opts]

let gensymc = 0
export function gensym(src = "") {
  let x
  do {
    x = "_" + gensymc++
  } while(src.includes(x))
  return x
}

export function taskSrc([ctx, cb, opts]: TaskSpec) {
  const names = `{${Object.keys(ctx).filter(i => i !== "import").join()}, ${ctx.import ? Object.keys(ctx.import).map(k => ctx.import[k].map(i => i[1]).join()).join() : ""}}`
  return `(() => {
    let ${names} = {}
    const cb = ${cb}
    const before = () => {${opts.before}}
    const after = () => {${opts.after}}
    const each = ${opts.each ?? "i => i"}
    return (lo, hi, ctx) => {
      ;(${names} = ctx)
      before()
      for(let i = hi - 1; i >= lo; i--) {
        const e = each(i)
        if(typeof e !== "number") {
          continue
        }
        cb(e)
      }
      after()
    }
  })()`
}

export class WorkerPool {
  workers: Worker[] = []
  msgc: {ping: Int32Array, data: Uint32Array}[] = []
  tasks: TaskSpec[] = []

  async init(nWorkers: number, {vars = {}, code = "", each = () => {}}: any = {}) {
    if(this.workers.length) throw new Error("Workers already initialised")
    Object.freeze(this.tasks)

    const modules = {paths: [] as string[], names: [] as string[]}
    const imports: Map<string, string>[] = []
    for(let t of this.tasks) {
      imports.push(new Map())
      for(let path in t[0].import) {
        const name = gensym()
        modules.paths.push(path)
        modules.names.push(name)
        for(let [x, y] of t[0].import[path]) {
          imports[imports.length - 1].set(name + "." + x, y)
        }
      }
    }

    const varnames = Object.keys(vars)
    const workerSource = `
    (async function() {
      ${code};
      const {parentPort} = require("worker_threads")
      const fns = [${this.tasks.map(t => taskSrc(t)).join()}]
      let ctx
      let msgc
      ${varnames.map(i => `let ${i}`).join("\n")}
      parentPort.onmessage = async function(e) {
        ;({ctx, msgc, ${varnames.join()}} = e.data)
        const promises = []
        ${modules.paths.map(i => `promises.push(await import("${i}"))`).join("\n")}
        const [${modules.names.join()}] = await Promise.all(promises)
        ${imports.map((m, i) => [...m.entries()].map(j => `ctx[${i}].${j[1]} = ${j[0]};`).join("\n")).join("\n")}
        parentPort.onmessage = function(e) {
          const {s, patch} = e.data
          Object.assign(ctx[s], patch)
          parentPort.postMessage(0)
        }
        parentPort.postMessage(0)
        while(true) {
          Atomics.wait(msgc.ping, 0, 0)
          fns[msgc.data[0]](msgc.data[1], msgc.data[2], ctx[msgc.data[0]])
          msgc.ping[0] = 0
          Atomics.notify(msgc.ping, 0, 1)
        }
      }
    })()`
    console.log(workerSource)

    const promises: Promise<any>[] = []
    for(let i = 0; i < nWorkers; i++) {
      const w = new Worker(workerSource, {eval: true})
      this.workers.push(w)
      this.msgc.push({ping: SharedInt32Array(1), data: SharedUint32Array(3)})
      promises.push(this.postmsg(i, {
        ctx: this.tasks.map(i => i[0]),
        msgc: this.msgc[i],
        ...vars,
      }))
    }
    await Promise.all(promises)
    for(let w of this.workers) {
      each(w)
    }
  }

  terminate() {
    for(let w of this.workers) {
      void w.terminate()
    }
  }

  postmsg(i: number, msg: any) {
    this.workers[i].postMessage(msg)
    return new Promise<void>((resolve, reject) => {
      const f = (e: any) => {
        if(e === 0) {
          resolve()
          this.workers[i].removeListener("message", f)
        }
      }
      this.workers[i].on("message", f)
    })
  }

  fastmsg(i: number, s: number, x: number, y: number) {
    this.msgc[i].ping[0] = 1
    this.msgc[i].data[0] = s
    this.msgc[i].data[1] = x
    this.msgc[i].data[2] = y
    Atomics.notify(this.msgc[i].ping, 0, 1)
    return Atomics.waitAsync(this.msgc[i].ping, 0, 1).value
  }

  task(ctx: Partial<CtxObj>, cb: NumFunc, opts: Opts = {}) {
    if(ctx.import) {
      if(!opts.filepath) throw new Error("Must specify filepath for imports")
      const require = createRequire(opts.filepath)
      for(let path in ctx.import) {
        for(let i = 0; i < ctx.import[path].length; i++) {
          const x: string | [string, string] = ctx.import[path][i]
          if(typeof x === "string") {
            ctx.import[path][i] = [x, x]
          }
        }
        ctx.import[require.resolve(path)] = ctx.import[path]
        delete ctx.import[path]
      }
    }
    const s = this.tasks.push([ctx as CtxObj, cb, opts]) - 1
    return async (lo: number, hi: number, patch?: any) => {
      const promises: Promise<void>[] = []
      if(patch) {
        for(let i = 0; i < this.workers.length; i++) {
          promises.push(this.postmsg(i, {s, patch}))
        }
        await Promise.all(promises)
        promises.length = 0
      }
      if(hi - lo < this.workers.length * 16) {
        return this.fastmsg(0, s, lo, hi)
      }
      const step = ~~((hi - lo) / this.workers.length)
      for(let i = 1; i < this.workers.length; i++) {
        promises.push(this.fastmsg(i, s, hi - step, hi))
        hi -= step
      }
      promises.push(this.fastmsg(0, s, lo, hi))
      return Promise.all(promises)
    }
  }
}
