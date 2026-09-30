import test from "node:test"
import assert from "node:assert/strict"
import { readOnnxCharacterDict } from "../src/ocr/onnx-character-dict.js"

const v = (n: number): number[] => n < 128 ? [n] : [n % 128 + 128, ...v(Math.floor(n / 128))]
const field = (number: number, bytes: Uint8Array): Buffer => Buffer.from([...v(number * 8 + 2), ...v(bytes.length), ...bytes])
const text = (number: number, value: string): Buffer => field(number, Buffer.from(value))
const entry = (key: string, value: string): Buffer => field(14, Buffer.concat([text(1, key), text(2, value)]))

test("reads the model's embedded alphabet while skipping graph weights", () => {
  const model = Buffer.concat([field(7, Buffer.alloc(1000, 255)), entry("author", "example"), entry("character", "a\nö\nß\n \n🛅")])
  assert.deepEqual(readOnnxCharacterDict(model), ["a", "ö", "ß", " ", "🛅"])
})
test("fails explicitly on missing/empty embedded alphabet", () => {
  assert.throws(() => readOnnxCharacterDict(entry("other", "value")), /alphabet/)
  assert.throws(() => readOnnxCharacterDict(entry("character", "")), /alphabet/)
})
test("rejects truncated or unsupported protobuf fields", () => {
  for (const bytes of [[114, 127], [128], [15], [10, 2, 1]]) assert.throws(() => readOnnxCharacterDict(Uint8Array.from(bytes)), /ONNX/)
})
