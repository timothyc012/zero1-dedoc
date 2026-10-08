import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parsePdfDocument } from "../src/pdf/parser.js"
import { joinPageBreakWraps, splitPageBreakWraps, PARA_LAST_LINE, PARA_FIRST_LEFT } from "../src/pdf/line-wrap.js"
import { pushLineParagraphs } from "../src/pdf/paragraph-lines.js"
import { sanitizeBlockControlChars } from "../src/pdf/text-clean.js"
import { detectListBlocks, detectKoreanListBlocks } from "../src/pdf/block-detect.js"
import { blocksToPages } from "../src/page-markdown.js"
import type { IRBlock } from "../src/types.js"

function pdfFrom(objects: string[]): ArrayBuffer {
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = Buffer.byteLength(pdf, "latin1")
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = Buffer.from(pdf, "latin1")
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer
}
const stream = (s: string) => `<< /Length ${Buffer.byteLength(s, "latin1")} >>\nstream\n${s}\nendstream`
const textOp = (s: string, y: number, x = 72) => `BT /F1 10 Tf 1 0 0 1 ${x} ${y} Tm (${s}) Tj ET\n`
function mappedTwoPagePdf(first: string, second: string, mappings: string[]): ArrayBuffer {
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Test def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n1 beginbfrange\n<20> <7E> <0020>\nendbfrange\n${mappings.length} beginbfchar\n${mappings.join("\n")}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`
  return pdfFrom([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 4 0 R >>",
    stream(cmap),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 6 0 R >>",
    stream(first),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 8 0 R >>",
    stream(second),
  ])
}
function twoPagePdf(mode: "plain" | "normalize" | "link"): ArrayBuffer {
  const cmap = "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Test def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n1 beginbfrange\n<20> <7E> <0020>\nendbfrange\n1 beginbfchar\n<23> <119E>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend"
  return pdfFrom([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>",
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding ${mode === "normalize" ? "/ToUnicode 4 0 R" : ""} >>`,
    stream(cmap),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 6 0 R >>",
    stream(textOp(mode === "normalize" ? "The first# page has a paragraph that continues" : "The first page has a paragraph that continues", 100)),
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 8 0 R ${mode === "link" ? "/Annots [9 0 R]" : ""} >>`,
    stream(textOp("on the second page.", 700)),
    "<< /Type /Annot /Subtype /Link /Rect [72 698 200 714] /A << /S /URI /URI (https://example.org) >> >>",
  ])
}
function paragraph(page: number, text: string, y = 100): IRBlock {
  const block: IRBlock = { type: "paragraph", text, pageNumber: page, bbox: { page, x: 72, y, width: 458, height: 10 }, style: { fontSize: 10 } }
  PARA_LAST_LINE.set(block.bbox!, { right: 530, width: 458, fontSize: 10 })
  PARA_FIRST_LEFT.set(block.bbox!, 72)
  return block
}

describe("PDF page provenance through final transformations", () => {
  for (const mode of ["plain", "normalize", "link"] as const) {
    it(`keeps page ownership and a joined document paragraph with ${mode} text`, async () => {
      const result = await parsePdfDocument(twoPagePdf(mode), { ocr: false, images: false, tables: false, removeHeaderFooter: false })
      assert.deepEqual(result.pages?.map(p => p.pageNumber), [1, 2])
      assert.equal(result.blocks?.length, 1)
      assert.ok(!result.pages![0].markdown.includes("second page"))
      assert.ok(result.pages![1].markdown.includes("on the second page."))
      if (mode === "normalize") assert.ok(result.pages![0].markdown.includes("firstㆍ"))
      if (mode === "link") assert.ok(result.markdown.includes("[on the second page.](https://example.org/)"))
    })
  }

  for (const changed of ["second\u0001 page continues", "secondᆞ page continues", "second\uF000 page continues"]) {
    it(`preserves all three page slices after cleaning ${JSON.stringify(changed)}`, () => {
      const blocks = [paragraph(1, "First page continues"), paragraph(2, changed), paragraph(3, "on the third page.")]
      joinPageBreakWraps(blocks)
      assert.equal(blocks.length, 1)
      sanitizeBlockControlChars(blocks)
      const split = splitPageBreakWraps(blocks)
      assert.deepEqual(split.map(b => b.pageNumber), [1, 2, 3])
      assert.equal(split[0].text, "First page continues")
      assert.equal(split[2].text, "on the third page.")
      assert.ok(!split[1].text!.includes("third"))
      assert.ok(!/[\u0001\u119E\uF000]/.test(split[1].text!))
      assert.equal(blocks.length, 1, "page projection must not mutate the document blocks")
    })
  }

  it("projects nested Korean list children to their own pages without duplicating parent text", () => {
    let blocks = [paragraph(1, "1. Main topic", 500), paragraph(1, "가. The child paragraph continues"),
      paragraph(2, "on the second page."), paragraph(2, "나. Another child", 500), paragraph(2, "2. Next topic", 400)]
    blocks = detectListBlocks(blocks)
    joinPageBreakWraps(blocks)
    detectKoreanListBlocks(blocks)
    assert.equal(blocks[0].children?.length, 2)
    const before = JSON.stringify(blocks)
    const pages = blocksToPages(splitPageBreakWraps(blocks))!
    assert.deepEqual(pages.map(p => p.pageNumber), [1, 2])
    assert.ok(pages[0].markdown.includes("Main topic"))
    assert.ok(!pages[0].markdown.includes("on the second page."))
    assert.ok(!pages[0].markdown.includes("Another child"))
    assert.ok(pages[1].markdown.includes("on the second page."))
    assert.ok(pages[1].markdown.includes("Another child"))
    assert.ok(!pages[1].markdown.includes("Main topic"))
    assert.equal(JSON.stringify(blocks), before)
  })

  it("retains children after a parent list item continues as a paragraph on the next page", async () => {
    const pdf = mappedTwoPagePdf(
      textOp("Introductory text.", 700) + textOp("1. The main topic is a long paragraph that continues", 100),
      textOp("on the second page.", 700) + textOp("#. First child", 650) + textOp("$. Second child", 600) + textOp("2. Next topic", 500),
      ["<23> <AC00>", "<24> <B098>"],
    )
    const result = await parsePdfDocument(pdf, { ocr: false, images: false, tables: false, removeHeaderFooter: false })
    assert.equal(result.blocks?.find(b => b.type === "list")?.children?.length, 2)
    assert.deepEqual(result.pages?.map(p => p.pageNumber), [1, 2])
    const page = result.pages![1].markdown
    let previous = -1
    for (const text of ["on the second page.", "First child", "Second child", "2. Next topic"]) {
      assert.ok(page.indexOf(text) > previous, `missing or out of order: ${text}`)
      assert.equal(page.split(text).length - 1, 1, `duplicate: ${text}`)
      assert.ok(!result.pages![0].markdown.includes(text))
      previous = page.indexOf(text)
    }
  })

  for (const code of ["0001", "F000"]) {
    it(`recognizes a sentence end before a discarded U+${code} glyph`, async () => {
      const pdf = mappedTwoPagePdf(textOp("The preceding paragraph has ended.#", 100),
        textOp("This is a new indented paragraph.", 700, 82), [`<23> <${code}>`])
      const result = await parsePdfDocument(pdf, { ocr: false, images: false, tables: false, removeHeaderFooter: false })
      assert.equal(result.blocks?.length, 2)
      assert.match(result.markdown, /ended\.\n\nThis is a new indented paragraph\./)
      assert.deepEqual(result.pages?.map(p => p.pageNumber), [1, 2])
    })
  }

  it("keeps explicit bracket headings separate even when ordinary link labels can continue", () => {
    for (const next of ["[1] New topic", "[그림 1] Illustration", "[1. New topic](https://example.org)"]) {
      const blocks = [paragraph(1, "The preceding paragraph continues"), paragraph(2, next)]
      joinPageBreakWraps(blocks)
      assert.equal(blocks.length, 2, next)
    }
  })

  it("uses real first-line geometry for a sole indented paragraph after a complete sentence", () => {
    const item = (text: string, x: number, y: number, w: number) => ({ text, x, y, w, h: 10, fontSize: 10, fontName: "Test", isHidden: false })
    const blocks: IRBlock[] = []
    pushLineParagraphs(blocks, [[item("The preceding paragraph has ended.", 72, 100, 458)]], 1)
    pushLineParagraphs(blocks, [[item("This is a new indented paragraph.", 82, 700, 240)]], 2)
    joinPageBreakWraps(blocks)
    assert.equal(blocks.length, 2)
  })
})
