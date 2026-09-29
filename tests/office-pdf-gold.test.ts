import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { docxParagraphs, pptxParagraphs, scoreUnits, xlsxSourceCells } from "../bench/lib/office-pdf-gold.mjs"

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const A = "http://schemas.openxmlformats.org/drawingml/2006/main"
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"

describe("independent Office source gold", () => {
  it("reads DOCX body paragraphs from Word XML in order", async () => {
    const zip = new JSZip()
    zip.file("word/document.xml", `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>For </w:t></w:r><w:r><w:t>,</w:t></w:r></w:p><w:p><w:r><w:t>Second line</w:t></w:r></w:p></w:body></w:document>`)
    assert.deepEqual(await docxParagraphs(await zip.generateAsync({ type: "uint8array" })), ["For ,", "Second line"])
  })

  it("keeps XLSX string codes, numeric storage, formula caches, and merges at source addresses", async () => {
    const zip = new JSZip()
    zip.file("xl/workbook.xml", `<workbook xmlns="${S}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Codes" sheetId="1" r:id="rId7"/></sheets></workbook>`)
    zip.file("xl/_rels/workbook.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Target="worksheets/sheet9.xml"/></Relationships>`)
    zip.file("xl/sharedStrings.xml", `<sst xmlns="${S}"><si><t>0420</t></si><si><r><t>Hallo</t></r><r><t> Welt</t></r></si></sst>`)
    zip.file("xl/worksheets/sheet9.xml", `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>1.23</v></c><c r="C1"><f>SUM(B1:B1)</f><v>1.23</v></c><c r="D1" t="s"><v>1</v></c></row></sheetData><mergeCells><mergeCell ref="A2:B2"/></mergeCells></worksheet>`)
    const [sheet] = await xlsxSourceCells(await zip.generateAsync({ type: "uint8array" }))
    assert.equal(sheet.name, "Codes")
    assert.deepEqual(sheet.cells.map(cell => [cell.address, cell.type, cell.value]), [
      ["A1", "string", "0420"], ["B1", "number", "1.23"], ["C1", "formula", "1.23"], ["D1", "string", "Hallo Welt"],
    ])
    assert.deepEqual(sheet.merges, ["A2:B2"])
  })

  it("uses presentation relationships, not slide filenames, for PPTX order", async () => {
    const zip = new JSZip()
    zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`)
    zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`)
    zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${A}"><a:p><a:r><a:t>SECOND</a:t></a:r></a:p></p:sld>`)
    zip.file("ppt/slides/slide2.xml", `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${A}"><a:p><a:r><a:t>FIRST</a:t></a:r></a:p></p:sld>`)
    assert.deepEqual((await pptxParagraphs(await zip.generateAsync({ type: "uint8array" }))).map(slide => slide.paragraphs), [["FIRST"], ["SECOND"]])
  })

  it("separates text presence from source order", () => {
    assert.deepEqual(scoreUnits(["Alpha", "Beta"], "Beta Alpha"), {
      totalUnits: 2, presentUnits: 2, orderedUnits: 1, exactUnitRecallWeighted: 1,
    })
  })
})
