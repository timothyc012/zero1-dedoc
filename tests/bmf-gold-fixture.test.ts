import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const gold = JSON.parse(readFileSync(new URL("../bench/office-pdf-gold.json", import.meta.url), "utf8"))
const page = (number: number) => gold.pages.find((item: any) => item.page === number)
const row = (number: number, sourceRow: number) => page(number).rows.find((item: any) => item.sourceRow === sourceRow)

describe("official BMF workbook-to-PDF page gold", () => {
  it("splits each 26-column workbook sheet into four printed pages", () => {
    assert.deepEqual(gold.pages.map((item: any) => [item.page, item.rows.length, item.printedColumnCount]), [
      [4, 35, 11], [5, 37, 11], [6, 35, 10], [7, 37, 10],
      [8, 35, 11], [9, 37, 11], [10, 35, 10], [11, 37, 10],
    ])
  })

  it("pins page 6 Berlin and federal Lohnsteuer to the source workbook cells", () => {
    const values = row(6, 6).values
    assert.equal(values[0].source, "P6")
    assert.equal(values[0].display, "1.457.433")
    assert.equal(values.at(-1).source, "Z6")
    assert.equal(values.at(-1).display, "26.397.545")
  })

  it("pins page 7 corporation tax and the full-width section merge", () => {
    assert.equal(row(7, 45).values[0].display, "-10.482")
    assert.equal(row(7, 44).role, "section")
    assert.ok(row(7, 44).merges.some((merge: any) => merge.pageColSpan === 10))
    assert.equal(page(7).footerIsOutsideTable, true)
  })
})
