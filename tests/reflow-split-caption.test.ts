import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { splitFloatTableRemainder } from "../src/render/reflow-tables.js"

const ns = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
// 1행 1칸 칸 안 나눔 표 — 칸 줄 셋(높이 1000, 간격 600, 끝 4200), 캡션 한 줄(높이 1000)·간격 850
function host(side?: "TOP" | "BOTTOM") {
  const segs = [0, 1600, 3200].map(v => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600"/>`).join("")
  const cap = side ? `<hp:caption side="${side}" fullSz="0" width="10000" gap="850" lastWidth="10000"><hp:subList><hp:p><hp:run><hp:t>표 1.</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600"/></hp:linesegarray></hp:p></hp:subList></hp:caption>` : ""
  const xml = `<hp:p ${ns}><hp:run><hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="5904"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${cap}<hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>본문</hp:t></hp:run><hp:linesegarray>${segs}</hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="5904"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`
  return createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
}
describe("쪽에서 갈리는 표의 위·아래 캡션", () => {
  it("아래 캡션은 마지막 조각 뒤에 선다 — 다음 쪽 몫에 간격 + 캡션 높이를 더한다", () => {
    // 표 위 3000, 쪽 바닥 6000 → 줄 둘이 이 쪽, 남은 줄 1000 + 캡션 850 + 1000
    assert.equal(splitFloatTableRemainder(host(), 3000, 6000, 10000), 1000)
    assert.equal(splitFloatTableRemainder(host("BOTTOM"), 3000, 6000, 10000), 1000 + 850 + 1000)
  })
  it("위 캡션은 첫 쪽 조각 앞에 서서 그 쪽에 드는 줄이 준다", () => {
    // 캡션 1850 이 표 위를 차지해 첫 줄만 이 쪽에 들고 남은 줄(1600 ~ 4200)이 다음 쪽으로, 새 쪽에서는 캡션을 되풀이하지 않는다
    assert.equal(splitFloatTableRemainder(host("TOP"), 3000, 6000, 10000), 2600)
  })
})
