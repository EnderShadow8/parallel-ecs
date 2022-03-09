import { acquireWriteLock, releaseWriteLock } from "worker-rwlock"
import { tPop, tLen, SharedUint32Array } from "./array"
import { sAdd, sHas, SparseSet, sRemove } from "./sparseset"
import { isMainThread } from "worker_threads"

export const curID = SharedUint32Array(1)

export let maxEntities = 1e6

export let deleted: SparseSet = SparseSet(maxEntities)
export let entityMasks = new Uint32Array(0)

export function setMaxEntities(max: number) {
  maxEntities = max
  deleted = SparseSet(max)
}

const queryMasks: Uint32Array[] = []
const queries: SparseSet[] = []

let nQueries = 0

const componentToQueries: number[][] = []

let nComponents = 0
export let maskLength = 0

export function component() {
  if(curID[0]) throw new Error("No new components after entity creation")
  nComponents++
  maskLength = Math.ceil(nComponents / 32)
  if(entityMasks.length < maskLength * maxEntities) {
    const m2 = new Uint32Array(maskLength * maxEntities)
    m2.set(entityMasks)
    entityMasks = m2
  }
  componentToQueries.push([])
  return nComponents - 1
}

export function query(...cmps: number[]) {
  const mask = SharedUint32Array(maskLength)
  for(let c of cmps) {
    mask[c >> 5] |= 1 << (c & 31)
    componentToQueries[c].push(nQueries)
  }
  queryMasks.push(mask)
  queries.push(SparseSet(maxEntities))
  for(let e = 0; e < curID[0]; e++) {
    if(sHas(deleted, e)) continue
    if(queryMatch(mask, entityMasks.subarray(e * maskLength, e * maskLength + maskLength))) {
      sAdd(queries[nQueries], e)
    }
  }
  return queries[nQueries++].packed
}

function queryMatch(q: Uint32Array, e: Uint32Array) {
  for(let i = 0; i < q.length; i++) {
    if((q[i] & e[i]) < q[i]) {
      return false
    }
  }
  return true
}

export function create() {
  if(!isMainThread) {
    let ret = -1
    acquireWriteLock(deleted.lock)
    if(tLen(deleted.packed)) {
      ret = tPop(deleted.packed)
    }
    releaseWriteLock(deleted.lock)
    if(ret !== -1) {
      return ret
    }
  }
  return createWithoutRecycle()
}

export function createWithoutRecycle() {
  const e = Atomics.add(curID, 0, 1)
  if(e >= maxEntities) {
    throw new Error("Too many entities")
  }
  return e
}

export function destroy(e: number) {
  if(e >= curID[0]) return
  if(sHas(deleted, e)) return
  for(let i = 0; i < maskLength; i++) {
    entityMasks[e * maskLength + i] = 0
  }
  for(let i = 0; i < nQueries; i++) {
    sRemove(queries[i], e)
  }
  sAdd(deleted, e)
}

export function hasComponent(e: number, c: number) {
  return !!(entityMasks[e * maskLength + (c >> 5)] & 1 << (c & 31))
}

export function addComponent(e: number, c: number) {
  entityMasks[e * maskLength + (c >> 5)] |= 1 << (c & 31)
  const cq = componentToQueries[c]
  for(let i = 0; i < cq.length; i++) {
    if(queryMatch(queryMasks[cq[i]], entityMasks.subarray(e * maskLength, e * maskLength + maskLength))) {
      sAdd(queries[cq[i]], e)
    }
  }
}

export function removeComponent(e: number, c: number) {
  entityMasks[e * maskLength + (c >> 5)] &= ~(1 << (c & 31))
  const cq = componentToQueries[c]
  for(let i = 0; i < cq.length; i++) {
    if(!queryMatch(queryMasks[cq[i]], entityMasks.subarray(e * maskLength, e * maskLength + maskLength))) {
      sRemove(queries[cq[i]], e)
    }
  }
}
