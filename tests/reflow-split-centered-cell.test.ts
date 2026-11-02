import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { splitFloatTableRemainder } from "../src/render/reflow-tables.js"

const ns = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
// 1행 1칸 칸 안 나눔 표 — 칸 줄 셋(높이 1000, 간격 600, 끝 4200)
function host(vertAlign: string, cellH: number, noAdjust = false) {
  const segs = [0, 1600, 3200].map(v => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600"/>`).join("")
  const xml = `<hp:p ${ns}><hp:run><hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"${noAdjust ? ' noAdjust="1"' : ""}><hp:sz width="10000" height="${cellH}"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList vertAlign="${vertAlign}"><hp:p><hp:run><hp:t>본문</hp:t></hp:run><hp:linesegarray>${segs}</hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${cellH}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`
  return createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
}
describe("칸 안 나눔 표의 가운데·아래 정렬 칸", () => {
  it("저장 높이에서 이 쪽 조각(남은 높이 − 101)을 뺀 만큼을 다음 쪽에 둔다", () => {
    // 표 위 3000, 쪽 바닥 6000 → 이 쪽 조각 2899. 줄 둘은 이 쪽에 들고, 다음 쪽 몫은 남은 줄 1000 이 아니라 8000 − 2899
    assert.equal(splitFloatTableRemainder(host("CENTER", 8000), 3000, 6000, 10000), 8000 - 2899)
    assert.equal(splitFloatTableRemainder(host("BOTTOM", 8000), 3000, 6000, 10000), 8000 - 2899)
  })
  it("위 정렬 칸은 남은 줄만 넘긴다", () => {
    assert.equal(splitFloatTableRemainder(host("TOP", 8000), 3000, 6000, 10000), 1000)
  })
  it("칸 높이를 고정한 표(noAdjust)는 위 정렬 칸도 저장 높이에서 이 쪽 조각(남은 높이 − 2)을 뺀 만큼을 다음 쪽에 둔다", () => {
    assert.equal(splitFloatTableRemainder(host("TOP", 8000, true), 3000, 6000, 10000), 8000 - 2998)
    assert.equal(splitFloatTableRemainder(host("CENTER", 8000, true), 3000, 6000, 10000), 8000 - 2998)
  })
  it("글이 저장 높이보다 길면 남은 줄 높이를 따른다", () => {
    assert.equal(splitFloatTableRemainder(host("CENTER", 3000), 3000, 6000, 10000), 1000)
  })
})
