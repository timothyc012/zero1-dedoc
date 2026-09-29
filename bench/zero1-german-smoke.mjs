#!/usr/bin/env node
// Reproducible text-layer PDF gate. Inputs are downloaded separately from the official sources.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { parse } from "../dist/index.js"
import { scoreBmfPage, scoreBmfFrontPage } from "./lib/bmf-score.mjs"

const [taxPath, formPath] = process.argv.slice(2)
if (!taxPath || !formPath) {
  console.error("Usage: npm run bench:german-smoke -- <BMF tax PDF> <Solvabilitätsnachweis PDF>")
  process.exit(2)
}

const inputs = [
  { path: taxPath, sha256: "1bbaae9366524c2830b52092b9e6a5f9b9bdb5a801402e48dd9e58d32385c4b2" },
  { path: formPath, sha256: "9fb138c73c0d7065203e1ed30a90d2febb3a2ab94a980cb31e679ce49f1ddda6" },
]
const results = []
for (const input of inputs) {
  const bytes = await readFile(input.path)
  const actual = createHash("sha256").update(bytes).digest("hex")
  assert.equal(actual, input.sha256, `source hash changed: ${input.path}`)
  const started = performance.now()
  const result = await parse(bytes, { ocr: false, images: false })
  assert.equal(result.success, true, `parse failed: ${input.path}`)
  results.push({ result, elapsedMs: Math.round(performance.now() - started) })
}

const tax = results[0].result
const tables = tax.blocks.filter(block => block.type === "table" && block.table)
const front = tables.filter(block => block.pageNumber <= 3)
const frontGold = JSON.parse(await readFile(new URL("./bmf-front-gold.json", import.meta.url), "utf8"))
const frontPages = frontGold.pages.map(page => scoreBmfFrontPage(page, tax.blocks.filter(block => block.pageNumber === page.page)))
assert.ok(frontPages.every(page => page.fullCellGoldPass), `BMF front table gold failed: ${JSON.stringify(frontPages.filter(page => !page.fullCellGoldPass))}`)
const bmfGold = JSON.parse(await readFile(new URL("./office-pdf-gold.json", import.meta.url), "utf8"))
const bmfPages = bmfGold.pages.map(page => scoreBmfPage(page, tax.blocks.filter(block => block.pageNumber === page.page)))
assert.ok(bmfPages.every(page => page.fullCellGoldPass), `BMF full cell/merge gold failed: ${JSON.stringify(bmfPages.filter(page => !page.fullCellGoldPass))}`)
const augustStates = tables.find(block => block.pageNumber === 6 && block.table.rows === 36 && block.table.cols === 10)?.table
assert.deepEqual(augustStates?.cells[2].map(cell => cell.text), ["Lohnsteuer", "1.457.433", "473.347", "236.049", "737.285", "335.632", "339.160", "24.276.071", "2.121.474", "26.397.545"])
const augustCorporate = tables.find(block => block.pageNumber === 7 && block.table.rows === 38 && block.table.cols === 10)?.table
assert.deepEqual(augustCorporate?.cells[2].map(cell => cell.text), ["Körperschaftsteuer", "-10.482", "14.115", "-3.022", "-17.420", "10.111", "-1.685", "-283.425", "2.100", "-281.326"])
const first = front[0].table
const lohnsteuer = first.cells.find(row => row.some(cell => cell.text === "Lohnsteuer"))
assert.deepEqual(lohnsteuer?.map(cell => cell.text), ["Lohnsteuer", "21.890.941", "20.966.969", "4,4", "178.401.148", "170.488.348", "4,6"])
assert.deepEqual(first.cells.at(-2)?.map(cell => cell.text),
  ["Zölle", "590.293", "529.521", "11,5", "4.005.606", "3.868.988", "3,5"])
assert.deepEqual(first.cells.at(-1)?.map(cell => cell.text),
  ["Steuern insgesamt ohne Gemeindesteuern", "64.323.011", "63.238.965", "1,7", "581.782.277", "576.546.324", "0,9"])

const form = results[1].result
const forms = ["F.701.01", "F.702.01", "F.703.01", "F.704.01", "F.705.01"]
for (const id of forms) assert.equal(form.markdown.split(`Formular ${id}`).length - 1, 1, `missing or repeated form title: ${id}`)
assert.ok(form.blocks.some(block => block.type === "table" && block.pageNumber === 2 && block.table?.cols === 6))

console.log(JSON.stringify({
  parser: "zero1-dedoc",
  options: { ocr: false, images: false },
  inputs: inputs.map((input, index) => ({ sha256: input.sha256, elapsedMs: results[index].elapsedMs })),
  taxTables: front.map(block => [block.pageNumber, block.table.rows, block.table.cols]),
  bmfFrontPages: frontPages.filter(page => page.fullCellGoldPass).length,
  bmfFrontAlignedValues: frontPages.reduce((sum, page) => sum + page.alignedDisplayValues, 0),
  bmfFullPages: bmfPages.filter(page => page.fullCellGoldPass).length,
  bmfAlignedValues: bmfPages.reduce((sum, page) => sum + page.alignedValueCells, 0),
  lohnsteuer: lohnsteuer.map(cell => cell.text),
  finalTaxTotal: first.cells.at(-1).map(cell => cell.text),
  formTitles: forms,
  peakRssMb: Math.round(process.memoryUsage().rss / 1048576),
}))
