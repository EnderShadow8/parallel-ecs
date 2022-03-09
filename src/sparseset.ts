import { DynamicInt32Array, DynamicUint32Array, SharedInt32Array, tLen, tPop, tPush } from "./array"

export function SparseSet(max: number): SparseSet {
  return {
    sparse: DynamicUint32Array(max),
    packed: DynamicUint32Array(max),
    lock: SharedInt32Array(3),
  }
}

export type SparseSet = {
  sparse: Uint32Array,
  packed: Uint32Array,
  lock: Int32Array,
}

export function sHas(s: SparseSet, x: number) {
  return s.packed[s.sparse[x]] === x && s.sparse[x] < tLen(s.packed)
}

export function sAdd(s: SparseSet, x: number) {
  if(sHas(s, x)) return
  s.sparse[x] = tLen(s.packed)
  tPush(s.packed, x)
}

export function sRemove(s: SparseSet, x: number) {
  if(!sHas(s, x)) return
  const last = s.packed[tLen(s.packed) - 1]
  if(x !== last) {
    s.packed[s.sparse[x]] = last
  }
  tPop(s.packed)
}
