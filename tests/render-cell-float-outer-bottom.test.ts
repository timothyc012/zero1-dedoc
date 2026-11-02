import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { measureTableHeight } from "../src/render/para-model.js"

const NS = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
// 칸 하나(칸 여백 141·141)에 떠 있는 그림 9795 — 바깥 여백 위아래 om
const tbl = (om: number) => createXmlParser().parseFromString(`<hp:tbl ${NS} rowCnt="1" colCnt="1"><hp:sz width="10000" height="1000"/><hp:tr><hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0">` +
  `<hp:run charPrIDRef="0"><hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="5000" height="9795"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="${om}" bottom="${om}"/></hp:pic><hp:t/></hp:run>` +
  `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="0"/></hp:linesegarray></hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element

describe("render: 칸 안 떠 있는 개체가 키우는 행 높이", () => {
  it("개체 바깥 위아래 여백을 모두 넣는다", () => {
    assert.equal(measureTableHeight(tbl(300)), 300 + 9795 + 300 + 282)
  })
  it("여백이 없으면 개체 높이 + 칸 여백", () => {
    assert.equal(measureTableHeight(tbl(0)), 9795 + 282)
  })
})
