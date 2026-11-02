import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parsePdfDocument } from "../src/pdf/parser.js"
import { parse } from "../src/index.js"

function buildSyntheticPdf(contentStream: string): ArrayBuffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefPos = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += String(o).padStart(10, "0") + " 00000 n \n"
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`
  const buf = Buffer.from(pdf, "latin1")
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const text = (x: number, y: number, s: string) => `BT /F1 10 Tf ${x} ${y} Td (${s}) Tj ET\n`
const framedPdf = () => buildSyntheticPdf(
  "1 w\n50 400 450 320 re S\nq 50 400 450 320 re W n\n" +
  text(60, 690, "Before the table the framed sentence continues on the next visual line") +
  text(60, 674, "and remains one complete paragraph.") +
  "Q\n100 580 160 40 re S\n260 580 160 40 re S\nq 100 580 160 40 re W n\n" +
  text(110, 600, "ALPHA") + "Q\nq 260 580 160 40 re W n\n" + text(270, 600, "BRAVO") +
  "Q\nq 50 400 450 320 re W n\n" +
  text(60, 550, "After the table a new paragraph follows the original reading order.") + "Q",
)

describe("PDF source frame output modes", () => {
  it("default IR and page Markdown keep paragraph/table/paragraph order; keep retains source table IR", async () => {
    const data = framedPdf()
    const visual = await parsePdfDocument(data, { removeHeaderFooter: false })
    const keep = await parsePdfDocument(data, { layoutTables: "keep", removeHeaderFooter: false })
    assert.ok(visual.blocks.some(b => b.table?.cols === 2))
    assert.ok(!visual.blocks.some(b => b.table?.cols === 1))
    assert.ok(keep.blocks.some(b => b.table?.cols === 1 && b.table.cells[0][0].blocks?.some(c => c.table?.cols === 2)))
    for (const r of [visual, keep]) {
      assert.ok(r.markdown.indexOf("Before the table") < r.markdown.indexOf("ALPHA"))
      assert.ok(r.markdown.indexOf("BRAVO") < r.markdown.indexOf("After the table"))
      assert.equal(r.markdown.match(/ALPHA/g)?.length, 1)
      assert.equal(r.pages?.[0].markdown, r.markdown)
      assert.equal(r.pages?.[0].pageNumber, 1)
    }
  })

  it("tables:false keeps all source text and public plain output has no nested HTML wrapper", async () => {
    const data = framedPdf()
    const off = await parsePdfDocument(data, { tables: false, removeHeaderFooter: false })
    const plain = await parse(data, { plain: true, removeHeaderFooter: false })
    assert.ok(plain.success)
    assert.ok(!off.blocks.some(b => b.table))
    for (const r of [off, plain]) for (const s of ["Before the table", "ALPHA", "BRAVO", "After the table"]) {
      assert.ok(r.markdown.includes(s))
    }
    assert.ok(!plain.markdown.includes("<table>"))
    assert.equal(plain.pages?.[0].markdown, plain.markdown)
  })

  it("preserves a real one-row three-column PDF data table", async () => {
    const data = buildSyntheticPdf(
      "1 w\n100 600 80 40 re S\n180 600 80 40 re S\n260 600 80 40 re S\n" +
      "q 100 600 80 40 re W n\n" + text(110, 615, "CATEGORY") + "Q\n" +
      "q 180 600 80 40 re W n\n" + text(190, 615, "VALUE") + "Q\n" +
      "q 260 600 80 40 re W n\n" + text(270, 615, "UNIT") + "Q",
    )
    const result = await parsePdfDocument(data, { removeHeaderFooter: false })
    const table = result.blocks.find(b => b.table?.rows === 1 && b.table.cols === 3)?.table
    assert.ok(table)
    assert.deepEqual(table.cells[0].map(c => c.text), ["CATEGORY", "VALUE", "UNIT"])
    assert.ok(result.markdown.includes("| CATEGORY | VALUE | UNIT |"))
  })
})
