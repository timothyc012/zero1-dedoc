import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
function line(runs: string, top = "0.15 mm", bottom = "0.15 mm", align = "BASELINE") {
  const head = `<hh:head ${ns}><hh:refList><hh:borderFills><hh:borderFill id="1"><hh:topBorder type="SOLID" width="${top}"/><hh:bottomBorder type="SOLID" width="${bottom}"/></hh:borderFill></hh:borderFills><hh:charProperties><hh:charPr id="0" height="1000"/><hh:charPr id="1" height="1000" borderFillIDRef="1"/><hh:charPr id="2" height="1100"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align vertical="${align}"/><hh:lineSpacing type="PERCENT" value="180"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
  const doc = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0">${runs}</hp:p></hs:sec>`, "text/xml")
  const root = doc.documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
  const seg = root.getElementsByTagName("hp:lineseg")[0]
  return ["vertsize", "textheight", "baseline", "spacing"].map(a => Number(seg.getAttribute(a)))
}
const run = (pr: number, text = "가") => `<hp:run charPrIDRef="${pr}"><hp:t>${text}</hp:t></hp:run>`
describe("글자 테두리 줄의 기준선", () => {
  it("저장본처럼 위 테두리를 포함한 글자 상자의 기준선을 쓴다", () => {
    assert.deepEqual(line(run(0) + run(1)), [1042, 1084, 886, 868])
  })
  it("위 테두리 두께를 따르고 아래 테두리는 기준선에 더하지 않는다", () => {
    assert.deepEqual(line(run(1), "0.1 mm", "0.3 mm"), [1028, 1113, 874, 888])
  })
  it("더 큰 일반 글자가 지배하면 그 기준선을 유지한다", () => {
    assert.deepEqual(line(run(2) + run(1)), [1100, 1100, 935, 880])
  })
  it("아래 테두리만 있으면 기준선은 변하지 않는다", () => {
    assert.deepEqual(line(run(1), "0 mm"), [1000, 1042, 850, 832])
  })
  it("수식 기준선이 더 높으면 수식을 따른다", () => {
    const eq = '<hp:run charPrIDRef="0"><hp:equation baseLine="90"><hp:sz width="1000" height="2000"/><hp:pos treatAsChar="1"/></hp:equation></hp:run>'
    assert.deepEqual(line(run(1) + eq), [2000, 2000, 1800, 868])
  })
  for (const [align, baseline] of [["TOP", 0], ["CENTER", 542], ["BOTTOM", 1084]] as const) {
    it(`${align} 세로 정렬은 유지한다`, () => {
      assert.equal(line(run(1), undefined, undefined, align)[2], baseline)
    })
  }
})
