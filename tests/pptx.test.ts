import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { parse } from "../src/index.js"

async function makePptx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`)
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="1" r:id="rId1"/><p:sldId id="2" r:id="rId2"/></p:sldIdLst></p:presentation>`)
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`)
  const ns = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
  zip.file("ppt/slides/slide1.xml", `<p:sld ${ns}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Quarterly Report</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Revenue increased</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Value</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Sales</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>42</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`)
  zip.file("ppt/slides/slide2.xml", `<p:sld ${ns}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="subTitle"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Conclusion</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`)
  zip.file("ppt/notesSlides/notesSlide1.xml", `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`)
  return zip.generateAsync({ type: "arraybuffer" })
}

async function makeAdvancedPptx(): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(await makePptx())
  const path = "ppt/slides/slide1.xml"
  const original = await zip.file(path)!.async("text")
  const grouped = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="Group 1"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="10" name="Grouped text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Grouped text</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>`
  const image = `<p:pic><p:nvPicPr><p:cNvPr id="11" name="Picture 1" descr="chart image"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>`
  const merged = original.replace("<a:tc><a:txBody>", "<a:tc><a:tcPr gridSpan=\"2\"/><a:txBody>")
  zip.file(path, merged.replace("</p:spTree>", `${grouped}${image}</p:spTree>`))
  return zip.generateAsync({ type: "arraybuffer" })
}

describe("PPTX parser", () => {
  it("preserves slide order, title levels, table cells, and notes", async () => {
    const result = await parse(await makePptx())
    assert.equal(result.success, true)
    if (!result.success) return
    assert.equal(result.fileType, "pptx")
    assert.equal(result.pageCount, 2)
    assert.match(result.markdown, /# Quarterly Report/)
    assert.match(result.markdown, /Revenue increased/)
    assert.match(result.markdown, /\| Metric \| Value \|/)
    assert.match(result.markdown, /Speaker note/)
    assert.match(result.markdown, /## Conclusion/)
  })

  it("walks grouped shapes, preserves grid spans, and warns on image-only shapes", async () => {
    const result = await parse(await makeAdvancedPptx())
    assert.equal(result.success, true)
    if (!result.success) return
    assert.match(result.markdown, /Grouped text/)
    assert.ok(result.blocks.some(block => block.table?.cells[0]?.[0]?.colSpan === 2))
    assert.ok(result.warnings?.some(warning => warning.code === "UNSUPPORTED_ELEMENT" && /image/.test(warning.message)))
  })

  it("honors slide ranges for library, CLI, worker, and MCP parse_pages", async () => {
    const result = await parse(await makePptx(), { pages: "2" })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.equal(result.pageCount, 2)
    assert.ok(result.blocks.every(block => block.pageNumber === 2))
    assert.match(result.markdown, /Conclusion/)
    assert.doesNotMatch(result.markdown, /Quarterly Report|Revenue increased|Speaker note/)
  })

  it("uses DrawingML grid columns without counting hMerge/vMerge continuation cells twice", async () => {
    const zip = await JSZip.loadAsync(await makePptx())
    const tc = (text: string, attrs = "") => `<a:tc ${attrs}><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody></a:tc>`
    const table = `<a:tbl><a:tblGrid><a:gridCol/><a:gridCol/><a:gridCol/></a:tblGrid>
      <a:tr>${tc("merged",'rowSpan="2" gridSpan="2"')}${tc("",'hMerge="1" rowSpan="2"')}${tc("right")}</a:tr>
      <a:tr>${tc("",'vMerge="1" gridSpan="2"')}${tc("",'hMerge="1" vMerge="1"')}${tc("below")}</a:tr>
      <a:tr>${tc("left")}${tc("middle")}${tc("tail")}</a:tr></a:tbl>`
    zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:graphicFrame><a:graphic><a:graphicData>${table}</a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`)
    const result = await parse(await zip.generateAsync({ type: "arraybuffer" }))
    assert.equal(result.success, true)
    if (!result.success) return
    const actual = result.blocks.find(block => block.type === "table" && block.pageNumber === 1)?.table
    assert.ok(actual)
    assert.deepEqual([actual.rows, actual.cols], [3, 3])
    assert.deepEqual([actual.cells[0][0].text, actual.cells[0][0].rowSpan, actual.cells[0][0].colSpan], ["merged", 2, 2])
    assert.equal(actual.cells[0][2].text, "right")
    assert.equal(actual.cells[1][2].text, "below")
    assert.equal(actual.cells[2][2].text, "tail")
  })

  it("keeps paragraph boundaries inside a merged table cell", async () => {
    const zip = await JSZip.loadAsync(await makePptx())
    const path = "ppt/slides/slide1.xml"
    const xml = await zip.file(path)!.async("text")
    zip.file(path, xml.replace("<a:t>Metric</a:t></a:r></a:p>", "<a:t>Metric</a:t></a:r></a:p><a:p><a:r><a:t>Label</a:t></a:r></a:p>"))
    const result = await parse(await zip.generateAsync({ type: "arraybuffer" }))
    assert.equal(result.success, true)
    if (!result.success) return
    const table = result.blocks.find(block => block.type === "table")?.table
    assert.equal(table?.cells[0][0].text, "Metric\nLabel")
  })

  it("uses transformed positions for text inside a horizontally flipped group", async () => {
    const zip = await JSZip.loadAsync(await makePptx())
    const shape = (text: string, x: number) => `<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="1" name="flipped"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm flipH="1"><a:off x="0" y="0"/><a:ext cx="400000" cy="200000"/><a:chOff x="0" y="0"/><a:chExt cx="400000" cy="200000"/></a:xfrm></p:grpSpPr>${shape("Right visually",50000)}${shape("Left visually",250000)}</p:grpSp>`
    zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${group}</p:spTree></p:cSld></p:sld>`)
    const result = await parse(await zip.generateAsync({ type: "arraybuffer" }), { pages: "1" })
    assert.equal(result.success, true)
    if (!result.success) return
    assert.deepEqual(result.blocks.map(block => block.text).filter(text => text?.includes("visually")), ["Left visually", "Right visually"])
  })

  it("excludes the notes slide-number placeholder from speaker notes", async () => {
    const zip = await JSZip.loadAsync(await makePptx())
    const path = "ppt/notesSlides/notesSlide1.xml"
    const xml = await zip.file(path)!.async("text")
    const marker = `<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></p:txBody></p:sp>`
    zip.file(path, xml.replace("</p:spTree>", `${marker}</p:spTree>`))
    const result = await parse(await zip.generateAsync({ type: "arraybuffer" }))
    assert.equal(result.success, true)
    if (!result.success) return
    const note = result.blocks.find(block => block.text?.includes("Speaker note"))
    assert.equal(note?.text, "Speaker note")
  })
})
