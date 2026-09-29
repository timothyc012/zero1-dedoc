import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { scoreCellValues, scoreHeadingOrder, scoreTableShapes } from "../bench/lib/office-pdf-metrics.mjs"

describe("Office/PDF regression metrics", () => {
  it("counts zero-prefixed account codes and numeric values independently", () => {
    const sheets = [{ number: 1, name: "Codes", merges: [], cells: [
      { address: "A1", type: "string", value: "0420" },
      { address: "B1", type: "string", value: "0970" },
      { address: "C1", type: "number", value: "1.23" },
    ] }]
    const output = [{ type: "table", pageNumber: 1, table: { cells: [[
      { text: "420" }, { text: "0970" }, { text: "1.23" },
    ]] } }]
    const score = scoreCellValues(sheets, output)
    assert.deepEqual(score.leadingZero, { source: 2, exactVisible: 1 })
    assert.equal(score.bySourceType.number.exactVisible, 1)
    assert.equal(score.bySourceType.string.exactVisible, 1)
    assert.equal(score.outputTypeMetadataAvailable, false)
  })

  it("does not call a heading an exact match when its level changes", () => {
    const score = scoreHeadingOrder([{ text: "3.2 Ergebnisse", level: 2 }], [
      { type: "heading", text: "3.2 Ergebnisse", level: 1 },
    ])
    assert.equal(score.exactOrdered, 0)
  })

  it("checks full table shape on the expected page", () => {
    const score = scoreTableShapes([{ page: 1, rows: 47, cols: 7 }], [
      { type: "table", pageNumber: 1, table: { rows: 46, cols: 7 } },
    ])
    assert.equal(score.exact, 0)
  })
})
