import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
function line(direction: string, align = "BASELINE", parentAlign = "CENTER", cache = "") {
  const head = `<hh:head ${ns}><hh:refList><hh:charProperties><hh:charPr id="0" height="1001"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align vertical="${align}"/><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
  const root = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:tbl rowCnt="1" colCnt="1"><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="1"/><hp:tr><hp:tc><hp:subList textDirection="${direction}" vertAlign="${parentAlign}"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>글</hp:t></hp:run>${cache}</hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="5000"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
  const s = root.getElementsByTagName("hp:subList")[0].getElementsByTagName("hp:lineseg")[0]
  return ["vertsize", "textheight", "baseline", "spacing"].map(a => Number(s.getAttribute(a)))
}
describe("가운데 배치 세로쓰기 하위 목록의 줄 기준선", () => {
  for (const direction of ["VERTICAL", "VERTICALALL"]) {
    it(`${direction}의 자동 기준선은 줄 높이의 정수 절반이다`, () => {
      assert.deepEqual(line(direction), [1001, 1001, 500, 600])
    })
    it(`${direction}의 명시적 문단 정렬을 우선한다`, () => {
      for (const [align, expected] of [["TOP", 0], ["CENTER", 500], ["BOTTOM", 1001]] as const) assert.equal(line(direction, align)[2], expected)
    })
  }
  it("가로쓰기의 가운데 칸 배치는 글 기준선을 바꾸지 않는다", () => {
    assert.deepEqual(line("HORIZONTAL"), [1001, 1001, 851, 600])
  })
  it("검증하지 않은 위·아래 배치 세로쓰기 목록은 기존 계산을 유지한다", () => {
    for (const align of ["TOP", "BOTTOM"]) assert.equal(line("VERTICAL", "BASELINE", align)[2], 851)
  })
  it("저장된 세로쓰기 좌표를 유지한다", () => {
    assert.deepEqual(line("VERTICAL", "BASELINE", "CENTER", '<hp:linesegarray><hp:lineseg textpos="0" vertsize="800" textheight="800" baseline="400" spacing="480"/></hp:linesegarray>'), [800, 800, 400, 480])
  })
})
