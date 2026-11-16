import { onnxFields } from "./onnx-character-dict.js"

/** PP-OCRv6 medium ships 2.3 M detector and 0.93 M recognizer weights under
 * this magnitude (14.5% of detector weights are subnormal; PP-OCRv5 has almost
 * none). Their products are subnormal, which x86 computes in microcode — v6
 * ran 30× slower on WSL x64 than on arm64 with the same code and threads.
 * Zeroing them removed 99.9%/96% of subnormal activations (de_val_0), gave
 * bit-identical det/rec outputs on its 88 real feeds, and left all 5,247 OCR
 * items of the 90-document German comparison unchanged (arm64 measurement).
 */
const TINY_WEIGHT = 1e-30

/** Zero FLOAT initializer values with 0 < |w| < 1e-30 in place; returns the count.
 * ModelProto.graph (7) → GraphProto.initializer (5) → TensorProto data_type
 * (2, FLOAT = 1), packed float_data (4), raw_data (9), data_location (14,
 * EXTERNAL = 1). Byte lengths do not change, so the buffer stays a valid model.
 */
export function flushTinyOnnxWeights(model: Uint8Array): number {
  const view = new DataView(model.buffer, model.byteOffset, model.byteLength)
  let zeroed = 0
  for (const graph of onnxFields(model).filter(f => f.number === 7)) {
    for (const tensor of onnxFields(graph.value).filter(f => f.number === 5)) {
      const parts = onnxFields(tensor.value)
      if (parts.find(p => p.number === 2)?.integer !== 1 || parts.some(p => p.number === 14 && p.integer === 1)) continue
      for (const data of parts.filter(p => (p.number === 4 || p.number === 9) && p.integer === undefined)) {
        const start = data.value.byteOffset - model.byteOffset
        for (let i = start; i + 4 <= start + data.value.length; i += 4) {
          const w = view.getFloat32(i, true)
          if (w !== 0 && Math.abs(w) < TINY_WEIGHT) { view.setFloat32(i, 0, true); zeroed++ }
        }
      }
    }
  }
  return zeroed
}
