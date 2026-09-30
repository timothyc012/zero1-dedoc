import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { editDistance, scoreOcrFields } from "../bench/lib/ocr-field-metrics.mjs"

describe("OCR field-region metrics", () => {
  it("uses source boxes alone to assign overlapping OCR lines", () => {
    const regions = [
      { id: "name", text: "Nordlicht Werkstatt", box: [500, 120, 900, 160] },
      { id: "address", text: "Schulstraße 71", box: [700, 160, 900, 195] },
    ]
    const items = [
      { text: "Nordlicht Werkstat", x: 500, y: 110, w: 400, h: 65 },
      { text: "Schulstraße 71", x: 700, y: 161, w: 190, h: 28 },
    ]
    const result = scoreOcrFields(regions, items)
    assert.equal(result.summary.matchedRegions, 2)
    assert.equal(result.fields[0].prediction, "nordlicht werkstat")
    assert.equal(result.fields[1].prediction, "schulstraße 71")
    assert.equal(result.summary.characterErrors, 1)
  })

  it("counts missing fields and word errors without capping rates", () => {
    const result = scoreOcrFields([{ id: "id", text: "RG2024-5726", box: [0, 0, 100, 20] }], [])
    assert.equal(result.summary.cer, 1)
    assert.equal(result.summary.wer, 1)
    assert.equal(result.fields[0].prediction, "")
    assert.equal(editDistance(["red", "green"], ["red", "blue"]), 1)
  })

  it("matches short OCR lines inside a wide multiline field box", () => {
    const result = scoreOcrFields([
      { id: "name", text: "Nordlicht Werkstatt", box: [500, 120, 900, 160] },
      { id: "address", text: "Schulstraße 71", box: [500, 145, 900, 205] },
    ], [
      { text: "Nordlicht Werkstatt", x: 500, y: 112, w: 390, h: 54 },
      { text: "Schulstraße 71", x: 780, y: 171, w: 105, h: 16 },
    ])
    assert.equal(result.fields[1].prediction, "schulstraße 71")
  })
})
