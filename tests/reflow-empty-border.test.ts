import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"
const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${ns}><hh:refList><hh:borderFills><hh:borderFill id="1"><hh:topBorder type="SOLID" width="0.3 mm"/><hh:bottomBorder type="SOLID" width="0.3 mm"/></hh:borderFill></hh:borderFills><hh:charProperties><hh:charPr id="0" height="1500"/><hh:charPr id="1" height="1500" borderFillIDRef="1"/><hh:charPr id="2" height="2000"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
function line(runs: string, cache = "") {
  const root = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0">${runs}${cache}</hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
  const s = root.getElementsByTagName("hp:lineseg")[0]
  return ["vertsize", "textheight", "baseline", "spacing"].map(a => Number(s.getAttribute(a)))
}
const empty = '<hp:run charPrIDRef="1"/>'
describe("빈 문단의 글자 테두리", () => {
  it("저장본의 빈 줄 높이를 유지하고 테두리의 반폭을 글자 상자에 반영한다", () => {
    assert.deepEqual(line(empty), [1500, 1668, 1346, 1000])
  })
  it("빈 hp:t가 있어도 같은 빈 줄로 처리한다", () => {
    assert.deepEqual(line('<hp:run charPrIDRef="1"><hp:t/></hp:run>'), [1500, 1668, 1346, 1000])
  })
  it("일반 빈 문단은 기존 높이 그대로다", () => {
    assert.deepEqual(line('<hp:run charPrIDRef="0"/>'), [1500, 1500, 1275, 900])
  })
  it("실제 글자나 공백이 있는 줄의 기존 테두리 계산은 유지한다", () => {
    for (const text of ["가", " "]) assert.deepEqual(line(`<hp:run charPrIDRef="1"><hp:t>${text}</hp:t></hp:run>`), [1585, 1670, 1347, 1000])
  })
  it("더 큰 빈 run이 있으면 그 글자 높이가 지배한다", () => {
    assert.deepEqual(line(empty + '<hp:run charPrIDRef="2"/>'), [2000, 2000, 1700, 1200])
  })
  it("컨트롤만 있는 호스트를 빈 run 문단으로 바꾸지 않는다", () => {
    assert.deepEqual(line('<hp:run charPrIDRef="1"><hp:ctrl><hp:pageNum/></hp:ctrl></hp:run>'), [1500, 1500, 1275, 900])
  })
  it("인라인 개체 전용 호스트는 개체 높이를 유지한다", () => {
    assert.deepEqual(line('<hp:run charPrIDRef="1"><hp:pic><hp:sz width="1000" height="2000"/><hp:pos treatAsChar="1"/></hp:pic></hp:run>'), [2000, 2000, 1700, 900])
  })
  it("저장된 조판 캐시는 그대로 둔다", () => {
    assert.deepEqual(line(empty, '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="777" textheight="999" baseline="888" spacing="500"/></hp:linesegarray>'), [777, 999, 888, 500])
  })
})
