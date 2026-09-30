/** Read ModelProto.metadata_props (field 14), skipping tensor/graph bytes.
 * The PP-OCRv6 alphabet ships inside the SHA-verified ONNX recognizer, so
 * downloading a separate dictionary cannot silently mismatch model classes.
 */
export function readOnnxCharacterDict(model: Uint8Array): string[] {
  function fields(bytes: Uint8Array): Array<{ number: number; value: Uint8Array }> {
    let cursor = 0
    const output: Array<{ number: number; value: Uint8Array }> = []
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
      if (wire === 0) { integer(); continue }
      const size = wire === 2 ? integer() : wire === 1 ? 8 : wire === 5 ? 4 : -1
      if (size < 0 || size > bytes.length - cursor) throw new Error("Invalid ONNX protobuf length or wire type")
      if (wire === 2) output.push({ number, value: bytes.subarray(cursor, cursor + size) })
      cursor += size
    }
    return output
  }
  const decode = new TextDecoder("utf-8", { fatal: true })
  for (const property of fields(model).filter(field => field.number === 14)) {
    const entry = fields(property.value)
    const key = entry.find(field => field.number === 1)
    if (!key || decode.decode(key.value) !== "character") continue
    const value = entry.find(field => field.number === 2)
    const alphabet = value ? decode.decode(value.value).split("\n").filter(character => character.length > 0) : []
    if (alphabet.length) return alphabet
  }
  throw new Error("ONNX recognizer has no embedded character alphabet")
}
