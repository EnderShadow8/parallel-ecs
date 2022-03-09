export type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array

export function SharedUint32Array(len = 0) {
  return new Uint32Array(new SharedArrayBuffer(len * 4))
}

export function DynamicUint32Array(maxLen = 0) {
  return SharedUint32Array(maxLen + 1)
}

export function SharedInt32Array(len = 0) {
  return new Int32Array(new SharedArrayBuffer(len * 4))
}

export function DynamicInt32Array(maxLen = 0) {
  return SharedInt32Array(maxLen + 1)
}

export function SharedFloat32Array(len = 0) {
  return new Float32Array(new SharedArrayBuffer(len * 4))
}

export function DynamicFloat32Array(maxLen = 0) {
  return SharedFloat32Array(maxLen + 1)
}

export function SharedFloat64Array(len = 0) {
  return new Float64Array(new SharedArrayBuffer(len * 8))
}

export function DynamicFloat64Array(maxLen = 0) {
  return SharedFloat64Array(maxLen + 1)
}

export function tLen(arr: TypedArray) {
  return arr[arr.length - 1]
}

export function tPush(arr: TypedArray, x: number) {
  arr[arr[arr.length - 1]++] = x
}

export function tPop(arr: TypedArray) {
  return arr[arr[arr.length - 1]--]
}
