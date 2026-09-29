import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { scoreBmfPage } from "../bench/lib/bmf-score.mjs"

const page = {
  page: 6, printedColumnCount: 3,
  printedColumns: [{ text: "Steuerart" }, { text: "Berlin" }, { text: "Brandenburg" }],
  rows: [
    { role: "section", label: "Lohnsteuer", values: [{ display: null }, { display: null }] },
    { role: "data", label: "Lohnsteuer", values: [{ display: "1.457.433" }, { display: "473.347" }] },
  ],
}
const table = (rows: number, cols: number, cells: any[][]) => ({
  type: "table", pageNumber: 6, table: { rows, cols, cells },
})
const good = table(3, 3, [
  [{ text: "Steuerart", colSpan: 1 }, { text: "Berlin", colSpan: 1 }, { text: "Brandenburg", colSpan: 1 }],
  [{ text: "Lohnsteuer", colSpan: 3 }],
  [{ text: "Lohnsteuer", colSpan: 1 }, { text: "1.457.433", colSpan: 1 }, { text: "473.347", colSpan: 1 }],
])

describe("BMF page gold scorer", () => {
  it("accepts one complete table with values and a full-width section", () => {
    assert.equal(scoreBmfPage(page, [good]).fullCellGoldPass, true)
  })

  it("rejects fragmented tables even when all numeric tokens survive", () => {
    const split = [table(2, 2, good.table.cells.slice(0, 2)), table(1, 3, good.table.cells.slice(2))]
    const result = scoreBmfPage(page, split)
    assert.equal(result.exactDisplayValues, 2)
    assert.equal(result.exactFullTable, false)
    assert.equal(result.fullCellGoldPass, false)
  })

  it("rejects a footer placed in the table", () => {
    const footer = structuredClone(good)
    footer.table.cells[2][0].text = "Lohnsteuer Seite 3 von 4"
    assert.equal(scoreBmfPage(page, [footer]).fullCellGoldPass, false)
  })

  it("rejects a missing numeric cell even with the right geometry", () => {
    const missing = structuredClone(good)
    missing.table.cells[2][2].text = ""
    assert.equal(scoreBmfPage(page, [missing]).fullCellGoldPass, false)
  })

  it("rejects a value in the wrong column even when the page token multiset is complete", () => {
    const swapped = structuredClone(good)
    swapped.table.cells[2][1].text = "473.347"
    swapped.table.cells[2][2].text = "1.457.433"
    const result = scoreBmfPage(page, [swapped])
    assert.equal(result.exactDisplayValues, 2)
    assert.equal(result.alignedValueCells, 0)
    assert.equal(result.fullCellGoldPass, false)
  })
})
