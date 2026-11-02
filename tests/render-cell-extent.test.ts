import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { measureTableHeight } from "../src/render/para-model.js"

const NS = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (at: number, y: number, h: number) => `<hp:lineseg textpos="${at}" vertpos="${y}" vertsize="${h}" textheight="${h}" baseline="850" spacing="600" horzpos="0" horzsize="10000"/>`
const table = (content: string, inline: boolean, height = 1000) => `<hp:tbl ${NS} rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="${height}"/><hp:pos treatAsChar="${inline ? 1 : 0}" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${content}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${height}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
function nested(inline: boolean, y = 2000, grown = true, firstY = 0) {
  const inner = table(`<hp:p><hp:run><hp:t>내용</hp:t></hp:run><hp:linesegarray>${seg(0, 0, grown ? 10000 : 1000)}</hp:linesegarray></hp:p>`, inline)
  const host = `<hp:p><hp:run><hp:t>앞글</hp:t>${inner}</hp:run><hp:linesegarray>${seg(0, firstY, 1000)}${seg(2, y, 1000)}</hp:linesegarray></hp:p>`
  return createXmlParser().parseFromString(table(host, true), "text/xml").documentElement as unknown as Element
}

describe("중첩 표의 칸 높이", () => {
  it("둘째 줄의 인라인 표가 자라면 그 줄 위치부터 높이를 잰다", () => {
    assert.equal(measureTableHeight(nested(true)), 12000)
  })
  it("쪽이 갈린 뒤 인라인 표는 이어진 칸 좌표로 높이를 잰다", () => {
    const tbl = nested(true, 0, true, 2000)
    assert.equal(measureTableHeight(tbl), 13600)
  })
  it("자라지 않은 인라인 표와 일반 글 줄은 높이를 유지한다", () => {
    assert.equal(measureTableHeight(nested(true, 2000, false)), 3000)
  })
})
