import { createRequire } from "module"
import { tLen, tPop, tPush, DynamicUint32Array } from "./array"
import { maxEntities, hasComponent, curID, deleted, entityMasks, maskLength, addComponent, destroy, removeComponent, create, createWithoutRecycle } from "./entity"
import { CtxObj, taskSrc, NumFunc, WorkerPool, Opts } from "./parallel"

export const defaultWorkers = new WorkerPool()

const workerFuncs = `
const {acquireWriteLock, releaseWriteLock} = await import("${createRequire(import.meta.url).resolve("worker-rwlock")}")
const {DynamicUint32Array} = await import("${createRequire(import.meta.url).resolve("./array")}")

const maxEntities = ${maxEntities}

let buf = DynamicUint32Array(600)

function sendIfFull() {
  if(tLen(buf) === buf.length - 1) {
    parentPort.postMessage(buf)
    buf = DynamicUint32Array(600)
  }
}

function destroy(e) {
  tPush(buf, e)
  tPush(buf, -1)
  sendIfFull()
}

function addComponent(e, c) {
  if(!hasComponent(e, c)) {
    tPush(buf, e)
    tPush(buf, c | (1 << 31))
    sendIfFull()
  }
}

function removeComponent(e, c) {
  if(hasComponent(e, c)) {
    tPush(buf, e)
    tPush(buf, c)
    sendIfFull()
  }
}` + tLen + tPop + tPush + hasComponent + create + createWithoutRecycle

const packets: Uint32Array[] = []

export function initWorkers(nWorkers: number, wp = defaultWorkers) {
  return wp.init(nWorkers, {
    vars: {deleted, entityMasks, maskLength, curID},
    code: workerFuncs,
    each(w: any) {
      w.on("message", (p: Uint32Array | 0) => p && packets.push(p))
    },
  })
}

export function ParallelSystem(ctx: Partial<CtxObj>, cb: NumFunc, opts: Opts = {}, wp = defaultWorkers) {
  const sys = wp.task(ctx, cb, Object.assign(opts, {
    before: "buf[buf.length - 1] = 0",
    each: `i => ${Object.keys(ctx)[0]}[i]`, // First prop of ctx is query
    after: "parentPort.postMessage(buf)",
  }))
  const q = ctx[Object.keys(ctx)[0]]
  return async () => {
    await sys(0, tLen(q))
    for(let i = 0; i < packets.length; i++) {
      const p = packets[i]
      for(let i = 0; i < tLen(p); i += 2) {
        const e = p[i]
        const c = p[i + 1]
        if(c === -1 >>> 0) {
          destroy(e)
        } else if(c & 1 << 31) {
          addComponent(e, c & ~(1 << 31))
        } else {
          removeComponent(e, c)
        }
      }
    }
    packets.length = 0
  }
}

export function System(ctx: CtxObj, cb: NumFunc) {
  const sys = (0, eval)(taskSrc([ctx, cb, {}]))
  const q = ctx[Object.keys(ctx)[0]]

  return () => {
    sys(0, tLen(q), ctx)
  }
}
