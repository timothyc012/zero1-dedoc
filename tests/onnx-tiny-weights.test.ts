import test from "node:test"
import assert from "node:assert/strict"
import { flushTinyOnnxWeights } from "../src/ocr/onnx-tiny-weights.js"

const v = (n: number): number[] => n < 128 ? [n] : [n % 128 + 128, ...v(Math.floor(n / 128))]
const field = (number: number, bytes: Uint8Array): Buffer => Buffer.from([...v(number * 8 + 2), ...v(bytes.length), ...bytes])
const int = (number: number, value: number): Buffer => Buffer.from([...v(number * 8), ...v(value)])
const floats = (values: number[]): Buffer => Buffer.from(new Float32Array(values).buffer)
const tensor = (...parts: Buffer[]): Buffer => field(5, Buffer.concat(parts))
const model = (...tensors: Buffer[]): Buffer => Buffer.concat([int(1, 8), field(7, Buffer.concat([field(1, Buffer.from("node")), ...tensors])), field(14, Buffer.from("meta"))])
const at = (bytes: Uint8Array, values: Buffer): number[] => {
  const start = Buffer.from(bytes).indexOf(values)
  return [...new Float32Array(Uint8Array.from(bytes.subarray(start, start + values.length)).buffer)]
}

test("zeroes only float weights whose magnitude is below 1e-30, in place", () => {
  const raw = floats([1e-40, -1e-35, 1e-31, 1e-29, 0, -0, 1, -2.5, Number.NaN])
  const packed = floats([2e-31, 3])
  const bytes = model(tensor(int(1, 9), int(2, 1), field(9, raw)), tensor(int(2, 1), field(4, packed)))
  const length = bytes.length
  assert.equal(flushTinyOnnxWeights(bytes), 4)
  assert.equal(bytes.length, length)
  const out = at(bytes, floats([0, 0, 0, 1e-29]))
  assert.deepEqual(out.slice(0, 4), [0, 0, 0, Math.fround(1e-29)])
  assert.deepEqual(at(bytes, floats([0, 3])), [0, 3])
})

test("leaves non-float, external and graph-less data untouched", () => {
  const tiny = floats([1e-35, 1e-36])
  const int64 = tensor(int(2, 7), field(9, tiny))
  const external = tensor(int(2, 1), int(14, 1), field(9, tiny))
  const bytes = model(int64, external)
  const before = Buffer.from(bytes)
  assert.equal(flushTinyOnnxWeights(bytes), 0)
  assert.deepEqual(bytes, before)
  const noGraph = Buffer.concat([int(1, 8), field(9, tiny)])
  assert.equal(flushTinyOnnxWeights(noGraph), 0)
})

test("operates on a view without touching bytes outside it", () => {
  const inner = model(tensor(int(2, 1), field(9, floats([1e-33]))))
  const outer = Buffer.concat([floats([1e-33]), inner, floats([1e-33])])
  const view = outer.subarray(4, 4 + inner.length)
  assert.equal(flushTinyOnnxWeights(view), 1)
  assert.equal(outer.readFloatLE(0), Math.fround(1e-33))
  assert.equal(outer.readFloatLE(outer.length - 4), Math.fround(1e-33))
})

test("rejects truncated protobuf", () => {
  assert.throws(() => flushTinyOnnxWeights(Uint8Array.from([58, 10, 1])), /ONNX/)
})
