/** One protobuf field: length-delimited `value` is a view of the source bytes
 * (writes go through to them), a varint keeps its `integer`. Fixed-width
 * fields are skipped.
 */
export interface OnnxField { number: number; value: Uint8Array; integer?: number }

export function onnxFields(bytes: Uint8Array): OnnxField[] {
  let cursor = 0
  const output: OnnxField[] = []
  const integer = (): number => {
    let value = 0, factor = 1
    for (let i = 0; i < 10; i++) {
      if (cursor >= bytes.length) throw new Error("Truncated ONNX protobuf varint")
      const byte = bytes[cursor++]
      value += (byte & 127) * factor
      if (!Number.isSafeInteger(value)) throw new Error("Oversized ONNX protobuf integer")
      if (byte < 128) return value
      factor *= 128
    }
    throw new Error("Invalid ONNX protobuf varint")
  }
  while (cursor < bytes.length) {
    const tag = integer(), wire = tag % 8, number = Math.floor(tag / 8)
    if (!number) throw new Error("Invalid ONNX protobuf field")
    if (wire === 0) { output.push({ number, value: bytes.subarray(cursor, cursor), integer: integer() }); continue }
    const size = wire === 2 ? integer() : wire === 1 ? 8 : wire === 5 ? 4 : -1
    if (size < 0 || size > bytes.length - cursor) throw new Error("Invalid ONNX protobuf length or wire type")
    if (wire === 2) output.push({ number, value: bytes.subarray(cursor, cursor + size) })
    cursor += size
  }
  return output
}

/** Read ModelProto.metadata_props (field 14), skipping tensor/graph bytes.
 * The PP-OCRv6 alphabet ships inside the SHA-verified ONNX recognizer, so
 * downloading a separate dictionary cannot silently mismatch model classes.
 */
export function readOnnxCharacterDict(model: Uint8Array): string[] {
  const decode = new TextDecoder("utf-8", { fatal: true })
  for (const property of onnxFields(model).filter(field => field.number === 14)) {
    const entry = onnxFields(property.value)
    const key = entry.find(field => field.number === 1)
    if (!key || decode.decode(key.value) !== "character") continue
    const value = entry.find(field => field.number === 2)
    const alphabet = value ? decode.decode(value.value).split("\n").filter(character => character.length > 0) : []
    if (alphabet.length) return alphabet
  }
  throw new Error("ONNX recognizer has no embedded character alphabet")
}
