import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mergeOcrImageRegions } from "../src/pdf/ocr-region-merge.js"
import { recordFrameReadingUnit, FRAME_READING_UNITS } from "../src/pdf/frame-cell-blocks.js"
import type { IRBlock, BoundingBox } from "../src/types.js"
const region = { x1: 100, y1: 100, x2: 500, y2: 500 }
const paragraph = (text: string, x: number, y: number, width = 50, height = 10): IRBlock => ({ type: "paragraph", text, pageNumber: 1, bbox: { page: 1, x, y, width, height }, style: { fontName: "ocr", fontSize: height } })
const legend = () => {
  const first = paragraph("Legend one", 400, 300), second = paragraph("Legend two", 400, 280)
  const bbox: BoundingBox = { page: 1, x: 395, y: 275, width: 60, height: 40 }
  recordFrameReadingUnit([first, second], bbox)
  return { first, second, bbox }
}
describe("OCR keeps source frame reading units atomic", () => {
  it("does not insert an outside axis label between legend lines", () => {
    const { first, second, bbox } = legend(), axis = paragraph("0.6", 150, 290)
    const blocks: IRBlock[] = [], before = [first, second, axis].map(b => JSON.stringify(b))
    assert.equal(mergeOcrImageRegions(blocks, 1, [region], [first, second, axis]), 3)
    assert.deepEqual(blocks.map(b => b.text), ["0.6", "Legend one", "Legend two"])
    assert.deepEqual([first, second, axis].map(b => JSON.stringify(b)), before)
    assert.deepEqual(FRAME_READING_UNITS.get(blocks[1])?.bbox, bbox)
    assert.equal(FRAME_READING_UNITS.get(blocks[1]), FRAME_READING_UNITS.get(blocks[2]))
  })
  it("does not re-add a rejected single-character paragraph from a partial group", () => {
    const { first, second } = legend(); second.text = "x"
    const blocks: IRBlock[] = []
    assert.equal(mergeOcrImageRegions(blocks, 1, [region], [first, second]), 1)
    assert.deepEqual(blocks.map(b => b.text), ["Legend one"])
    assert.equal(FRAME_READING_UNITS.get(blocks[0]), undefined)
  })
  it("keeps native text and an uncovered OCR paragraph without re-adding native duplicates", () => {
    const { first, second } = legend(), native = paragraph("Native text", 400, 300)
    const blocks = [native]
    assert.equal(mergeOcrImageRegions(blocks, 1, [region], [first, second]), 1)
    assert.deepEqual(blocks.map(b => b.text), ["Native text", "Legend two"])
    assert.equal(FRAME_READING_UNITS.get(blocks[1]), undefined)
  })
  it("keeps separate frames independent and respects a larger confirmed flow unit", () => {
    const a = legend(), b = legend(); b.first.bbox!.x = b.second.bbox!.x = 300
    b.first.text = "Second frame one"; b.second.text = "Second frame two"
    recordFrameReadingUnit([b.first, b.second], { ...b.bbox, x: 295 })
    const flow = [a.first, a.second, b.first, b.second]
    const flowBox: BoundingBox = { page: 1, x: 295, y: 275, width: 160, height: 40 }
    recordFrameReadingUnit(flow, flowBox)
    const blocks: IRBlock[] = [], axis = paragraph("0.6", 150, 290)
    assert.equal(mergeOcrImageRegions(blocks, 1, [region], [...flow, axis]), 5)
    assert.deepEqual(blocks.map(b => b.text), ["0.6", "Legend one", "Legend two", "Second frame one", "Second frame two"])
    assert.deepEqual(FRAME_READING_UNITS.get(blocks[1])?.blocks, blocks.slice(1))
    const separate: IRBlock[] = []; const c = legend(), d = legend();d.first.bbox!.y = 200; d.second.bbox!.y = 180
    recordFrameReadingUnit([d.first, d.second], { ...d.bbox, y: 175 })
    mergeOcrImageRegions(separate, 1, [region], [c.first, c.second, d.first, d.second])
    assert.notEqual(FRAME_READING_UNITS.get(separate[0]), FRAME_READING_UNITS.get(separate[2]))
  })
})
