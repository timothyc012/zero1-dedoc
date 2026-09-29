#!/usr/bin/env node
/** Rebuild the BMF PDF page/column gold from the official companion XLSX. */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { xlsxSourceCells } from "./lib/office-pdf-gold.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const input = join(root, "bench/corpus/office-pdf")
const pdfBytes = await readFile(join(input, "bmf-tax-tables.pdf"))
const xlsxBytes = await readFile(join(input, "bmf-tax-tables.xlsx"))
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
const pdfSha = "1bbaae9366524c2830b52092b9e6a5f9b9bdb5a801402e48dd9e58d32385c4b2"
const xlsxSha = "36dd814e82b1066493201069cee7c638f9e753e9ea77fc52fd00a8a7d7f64f80"
if (sha(pdfBytes) !== pdfSha || sha(xlsxBytes) !== xlsxSha) throw new Error("Official BMF source hash mismatch")
const sheets = await xlsxSourceCells(xlsxBytes)
const byName = new Map(sheets.map(sheet => [sheet.name, sheet]))
const columns = ["F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","W","X","Z"]
const first = columns.slice(0,10), second = columns.slice(10)
const labelColumns = ["A","B","C","D","E"]
const pageSpecs = [
  [4,"5 Länder",5,43,first], [5,"5 Länder",44,83,first],
  [6,"5 Länder",5,43,second], [7,"5 Länder",44,83,second],
  [8,"5a Länder",5,43,first], [9,"5a Länder",44,83,first],
  [10,"5a Länder",5,43,second], [11,"5a Länder",44,83,second],
]

function displayNumeric(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`Nonfinite numeric gold: ${raw}`)
  const rounded = Math.floor(Math.abs(n) + 0.5)
  return `${n < 0 ? "-" : ""}${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g,".")}`
}
function columnNumber(label) {
  return [...label].reduce((n,char) => n*26 + char.charCodeAt(0)-64,0)
}
function rangeAt(ref, row, selected) {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref)
  if (!m || row < Number(m[2]) || row > Number(m[4])) return null
  const lo = columnNumber(m[1]), hi = columnNumber(m[3])
  const numeric = selected.filter(col => columnNumber(col) >= lo && columnNumber(col) <= hi)
  return { source:ref, labelCovered: lo <= 5 && hi >= 1, numericCovered:numeric.length,
    pageColSpan: Number(lo <= 5 && hi >= 1) + numeric.length }
}
const pages = pageSpecs.map(([page,sheetName,firstRow,lastRow,selected]) => {
  const sheet = byName.get(sheetName)
  if (!sheet) throw new Error(`Missing BMF worksheet ${sheetName}`)
  const cells = new Map(sheet.cells.map(cell => [cell.address,cell]))
  const cellAt = (col,row) => cells.get(`${col}${row}`)
  const header = selected.map(col => ({ source:`${col}4`, text:cellAt(col,4)?.value ?? "" }))
  const rows = []
  for (let row = firstRow; row <= lastRow; row++) {
    const labels = labelColumns.map(col => cellAt(col,row)).filter(Boolean)
    const values = selected.map(col => {
      const cell = cellAt(col,row)
      if (!cell) return { source:`${col}${row}`, raw:null, display:null }
      return { source:cell.address, raw:cell.value, display:cell.type === "number" || cell.type === "formula" && cell.value !== ""
        ? displayNumeric(cell.value) : cell.value, sourceType:cell.type }
    })
    if (labels.length === 0 && values.every(value => value.raw === null)) continue // print separator row
    rows.push({ sourceRow:row,
      role:values.some(value => value.raw !== null) ? "data" : "section",
      label:labels.map(cell => cell.value).join(" ").replace(/\s+/g," ").trim(),
      labelSources:labels.map(cell => cell.address), values,
      merges:sheet.merges.map(ref => rangeAt(ref,row,selected)).filter(Boolean),
    })
  }
  return { page, sheet:sheetName, sourceRowRange:[firstRow,lastRow],
    printedColumnCount:1+selected.length, printedColumns:[{source:"A:E",text:"Steuerart"},...header],
    rows, expectedFootnotes:page===7||page===11 ? [84,85] : [],
    footerIsOutsideTable:true }
})
const gold = {schema_version:"zero1-bmf-pdf-gold.v1",pdf_sha256:pdfSha,xlsx_sha256:xlsxSha,
  method:"Official workbook source rows and print column splits, checked against rendered PDF pages 4-11; display numbers rounded to integer thousands with German grouping",
  pages }
const output = resolve(process.argv[2] ?? join(root,"bench/office-pdf-gold.json"))
await writeFile(output,JSON.stringify(gold,null,2)+"\n")
console.log(JSON.stringify({output,pages:pages.map(item=>({page:item.page,rows:item.rows.length,cols:item.printedColumnCount}))}))
