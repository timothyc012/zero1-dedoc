import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { parse } from "../src/index.js"

const S="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const R="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const P="http://schemas.openxmlformats.org/package/2006/relationships"

async function fixture():Promise<ArrayBuffer>{
  const zip=new JSZip()
  zip.file("[Content_Types].xml",`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`)
  zip.file("xl/workbook.xml",`<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Values" sheetId="1" r:id="rId1"/></sheets></workbook>`)
  zip.file("xl/_rels/workbook.xml.rels",`<Relationships xmlns="${P}"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`)
  zip.file("xl/sharedStrings.xml",`<sst xmlns="${S}"><si><t>0420</t></si><si><t>2026-01-05</t></si><si><t>merged</t></si></sst>`)
  zip.file("xl/styles.xml",`<styleSheet xmlns="${S}"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`)
  zip.file("xl/worksheets/sheet1.xml",`<worksheet xmlns="${S}"><sheetData><row r="1">
    <c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>0970</t></is></c>
    <c r="C1" t="s"><v>1</v></c><c r="D1"><v>1.2300000000000002</v></c>
    <c r="E1"><v>1.23E+7</v></c><c r="F1" s="1"><v>46027</v></c>
    <c r="G1"><f>SUM(D1:D1)</f><v>1.2300000000000002</v></c>
    <c r="H1"><f>SUM(D1:E1)</f></c><c r="I1" t="b"><v>1</v></c>
    </row><row r="2"><c r="A2" t="s"><v>2</v></c></row></sheetData>
    <mergeCells count="1"><mergeCell ref="A2:B2"/></mergeCells></worksheet>`)
  return zip.generateAsync({type:"arraybuffer"})
}

describe("opt-in XLSX source-cell provenance",()=>{
  it("keeps codes, raw numbers, source types/addresses, formula cache state, and merge range",async()=>{
    const result=await parse(await fixture(),{includeCellProvenance:true})
    assert.equal(result.success,true)
    if(!result.success)return
    const table=result.blocks.find(block=>block.type==="table")?.table
    assert.ok(table)
    assert.deepEqual(table.cells[0].map(cell=>cell.text).slice(0,3),["0420","0970","2026-01-05"])
    assert.deepEqual(table.cells[0][0].sourceCell,{address:"A1",storedType:"string",rawValue:"0420"})
    assert.deepEqual(table.cells[0][1].sourceCell,{address:"B1",storedType:"string",rawValue:"0970"})
    assert.equal(table.cells[0][3].text,"1.23")
    assert.equal(table.cells[0][3].sourceCell?.rawValue,"1.2300000000000002")
    assert.equal(table.cells[0][3].sourceCell?.storedType,"number")
    assert.equal(table.cells[0][4].sourceCell?.rawValue,"1.23E+7")
    assert.equal(table.cells[0][5].text,"2026-01-05")
    assert.equal(table.cells[0][5].sourceCell?.rawValue,"46027")
    assert.equal(table.cells[0][5].sourceCell?.dateFormatted,true)
    assert.equal(table.cells[0][6].sourceCell?.formula,"SUM(D1:D1)")
    assert.equal(table.cells[0][6].sourceCell?.cachedValue,"1.2300000000000002")
    assert.equal(table.cells[0][7].text,"=SUM(D1:E1)")
    assert.equal(table.cells[0][7].sourceCell?.cachedValue,null)
    assert.equal(table.cells[0][7].sourceCell?.formula,"SUM(D1:E1)")
    assert.ok(result.warnings?.some(warning=>warning.code==="PARTIAL_PARSE"&&warning.message.includes("캐시")))
    assert.equal(table.cells[0][8].sourceCell?.storedType,"boolean")
    assert.equal(table.cells[1][0].colSpan,2)
    assert.equal(table.cells[1][0].sourceCell?.mergeRange,"A2:B2")
  })

  it("does not attach source metadata unless requested",async()=>{
    const result=await parse(await fixture())
    assert.equal(result.success,true)
    if(!result.success)return
    const table=result.blocks.find(block=>block.type==="table")?.table
    assert.ok(table)
    assert.equal(table.cells[0][0].sourceCell,undefined)
    assert.ok(result.warnings?.some(warning=>warning.code==="PARTIAL_PARSE"&&warning.message.includes("캐시")))
  })
})
