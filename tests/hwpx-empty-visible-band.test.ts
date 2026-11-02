import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { parseHwpxDocument } from "../src/hwpx/parser.js"
import { extractRef } from "../bench/ref/hwpx-ref.mjs"

async function emptyFormBand(fields: number, onlyFields = false): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const sides = ["left", "right", "top", "bottom"]
  const fill = (id: number, type: string) => '<hh:borderFill id="' + id + '">' + sides.map(s => '<hh:' + s + 'Border type="' + type + '" color="#000000"/>').join("") + '</hh:borderFill>'
  zip.file("Contents/header.xml", '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"><hh:refList><hh:borderFills>' + fill(1, "NONE") + fill(2, "SOLID") + '</hh:borderFills></hh:refList></hh:head>')
  const cols = fields + (onlyFields ? 0 : 1)
  const tc = (r: number, c: number, cs: number, text: string, bf: number) => '<hp:tc borderFillIDRef="' + bf + '"><hp:subList><hp:p><hp:run><hp:t>' + text + '</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr rowAddr="' + r + '" colAddr="' + c + '"/><hp:cellSpan rowSpan="1" colSpan="' + cs + '"/></hp:tc>'
  const fieldsRow = (onlyFields ? "" : tc(1, 0, 1, "", 1)) + Array.from({ length: fields }, (_, i) => tc(onlyFields ? 0 : 1, i + (onlyFields ? 0 : 1), 1, "", 2)).join("")
  const promptRow = onlyFields ? "" : "<hp:tr>" + tc(0, 0, cols - 1, "", 1) + tc(0, cols - 1, 1, "입력 안내", 1) + "</hp:tr>"
  zip.file("Contents/section0.xml", '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:tbl rowCnt="' + (onlyFields ? 1 : 2) + '" colCnt="' + cols + '">' + promptRow + '<hp:tr>' + fieldsRow + '</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>')
  return zip.generateAsync({ type: "arraybuffer" })
}

describe("빈 양식 입력란의 보이는 표 띠", () => {
  for (const fields of [1, 2]) {
    it(fields + "개 빈 입력란은 기본 후행 열 정리 후에도 마지막 칸을 남긴다", async () => {
      const result = await parseHwpxDocument(await emptyFormBand(fields))
      assert.deepEqual(result.blocks.map(b => b.type), ["paragraph", "table"])
      assert.equal(result.blocks[0].text, "입력 안내")
      const table = result.blocks[1].table!
      assert.equal(table.rows, 1)
      assert.equal(table.cols, 1)
      assert.ok(result.markdown.includes("<table>"), result.markdown)
      assert.equal((result.markdown.match(/<t[dh](?:\s[^>]*)?>/g) ?? []).length, 1)
      assert.deepEqual(table.cells[0].map(c => [c.text, c.rowSpan, c.colSpan]), [["", 1, 1]])
    })
  }

  it("표 전체가 빈 입력란이어도 구조와 HTML 표를 유지한다", async () => {
    for (const fields of [1, 2]) {
      const result = await parseHwpxDocument(await emptyFormBand(fields, true))
      assert.equal(result.blocks.length, 1)
      assert.equal(result.blocks[0].table!.rows, 1)
      assert.equal(result.blocks[0].table!.cols, 1)
      assert.ok(result.markdown.includes("<table>"), result.markdown)
      assert.equal((result.markdown.match(/<t[dh](?:\s[^>]*)?>/g) ?? []).length, 1)
    }
  })

  it("후행 빈 열 보존 옵션은 여러 입력란을 모두 남긴다", async () => {
    for (const onlyFields of [false, true]) {
      const result = await parseHwpxDocument(await emptyFormBand(2, onlyFields), { keepTrailingEmptyCols: true })
      const table = result.blocks.find(b => b.type === "table")!.table!
      assert.equal(table.cols, 2)
      assert.equal((result.markdown.match(/<t[dh](?:\s[^>]*)?>/g) ?? []).length, 2)
    }
  })

  it("원본 구조 모드는 안내문과 선 밖 빈 칸도 그대로 유지한다", async () => {
    const result = await parseHwpxDocument(await emptyFormBand(2), { layoutTables: "keep" })
    assert.equal(result.blocks.length, 1)
    assert.equal(result.blocks[0].table!.rows, 2)
    assert.equal(result.blocks[0].table!.cols, 3)
    assert.equal(result.blocks[0].table!.cells[0][2].text, "입력 안내")
  })
})


describe("보이는 표 참조 추출기의 원본 격자", () => {
  for (const fields of [1, 2]) {
    it(fields + "개 빈 입력란도 양수 치수와 실제 셀을 갖는다", async () => {
      const ref = await extractRef(await emptyFormBand(fields))
      assert.equal(ref.tables.length, 1)
      assert.equal(ref.tables[0].rows, 1)
      assert.equal(ref.tables[0].cols, 1)
      assert.equal(ref.tables[0].cells.length, 1)
      assert.deepEqual(ref.tables[0].cells.map(c => [c.r, c.c, c.rs, c.cs]), [[0, 0, 1, 1]])
    })
  }

  it("수식만 든 오른쪽 열은 빈 열이 아니다", async () => {
    const zip = new JSZip()
    const box = ["left", "right", "top", "bottom"].map(s => '<hh:' + s + 'Border type="SOLID" color="#000000"/>').join("")
    zip.file("Contents/header.xml", '<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"><hh:refList><hh:borderFills><hh:borderFill id="1">' + box + '</hh:borderFill></hh:borderFills></hh:refList></hh:head>')
    const tc = (r: number, c: number, content: string) => '<hp:tc borderFillIDRef="1"><hp:subList><hp:p><hp:run>' + content + '</hp:run></hp:p></hp:subList><hp:cellAddr rowAddr="' + r + '" colAddr="' + c + '"/><hp:cellSpan rowSpan="1" colSpan="1"/></hp:tc>'
    zip.file("Contents/section0.xml", '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:tbl rowCnt="2" colCnt="2"><hp:tr>' + tc(0, 0, "<hp:t>항목</hp:t>") + tc(0, 1, "<hp:equation><hp:script>x+y</hp:script></hp:equation>") + '</hp:tr><hp:tr>' + tc(1, 0, "<hp:t>값</hp:t>") + tc(1, 1, "<hp:equation><hp:script>x^2</hp:script></hp:equation>") + '</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>')
    const ref = await extractRef(await zip.generateAsync({ type: "arraybuffer" }))
    assert.equal(ref.tables.length, 1)
    assert.equal(ref.tables[0].rows, 2)
    assert.equal(ref.tables[0].cols, 2)
    assert.equal(ref.tables[0].cells.length, 4)
    assert.equal(ref.specials.equations, 2)
    assert.deepEqual(ref.tables[0].cells.filter(c => c.c === 1).map(c => c.hasIrContent), [true, true])
  })
})
