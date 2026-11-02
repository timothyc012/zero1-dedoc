import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${ns}><hh:refList><hh:charProperties><hh:charPr id="0" height="100"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:lineSpacing type="PERCENT" value="80"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
function lines(width: number, prefix: string) {
  const table = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="${width}" height="3000"/><hp:pos treatAsChar="1"/></hp:tbl>`
  const doc = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${prefix}${table}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
  const root = doc.documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 2000, BODY_H: 70000 })
  return Array.from(root.getElementsByTagName("hp:lineseg")).map(s => ["vertpos", "vertsize", "textheight"].map(a => Number(s.getAttribute(a))))
}
const control = '<hp:ctrl><hp:pageNum/></hp:ctrl>'
describe("폭을 넘긴 인라인 표의 점유 높이", () => {
  it("컨트롤뿐인 앞줄에는 시도한 표 높이를 남기며 실제 줄 전진 간격은 유지한다", () => {
    assert.deepEqual(lines(2100, control), [[0, 3000, 100], [80, 3000, 3000]])
  })
  it("앞줄에 글이 있으면 표 높이를 앞줄에 덧씌우지 않는다", () => {
    assert.deepEqual(lines(2100, '<hp:t>가</hp:t>'), [[0, 100, 100], [80, 3000, 3000]])
  })
  it("명시적 줄바꿈으로 나눈 표의 앞줄은 그대로 둔다", () => {
    assert.deepEqual(lines(2100, '<hp:t><hp:lineBreak/></hp:t>'), [[0, 100, 100], [80, 3000, 3000]])
  })
  it("폭 안에 드는 표는 첫줄에 놓는다", () => {
    assert.deepEqual(lines(1900, control), [[0, 3000, 3000]])
  })
})
