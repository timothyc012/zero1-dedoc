import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${ns}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="HY신명조"/><hh:font id="1" face="KoPub돋움체 Light"/></hh:fontface><hh:fontface lang="LATIN"><hh:font id="0" face="맑은 고딕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="800"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="1" height="1200"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="2" height="1200"><hh:fontRef hangul="1" latin="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0" fontLineHeight="1"><hh:lineSpacing type="PERCENT" value="100"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
const run = (id: number, text: string) => `<hp:run charPrIDRef="${id}"><hp:t>${text}</hp:t></hp:run>`
function lines(runs: string, header = head, cache = "") {
  const root = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0">${runs}${cache}</hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(header), { BODY_W: 42000, BODY_H: 80000 })
  return Array.from(root.getElementsByTagName("hp:lineseg")).map(s => ["textpos", "vertsize", "baseline", "spacing"].map(a => Number(s.getAttribute(a))))
}
describe("글꼴 줄 높이의 공백 run", () => {
  it("큰 공백의 한글 글꼴 ascent를 같은 줄 기준선에 포함한다", () => {
    assert.deepEqual(lines(run(0, "가나다") + run(1, " ")), [[0, 1200, 1030, 0]])
  })
  it("앞 공백도 같은 줄의 ascent에 포함한다", () => {
    assert.deepEqual(lines(run(1, " ") + run(0, "가나다")), [[0, 1200, 1030, 0]])
  })
  it("ASCII 공백뿐인 줄과 빈 줄은 기존 명목 기준선을 유지한다", () => {
    for (const text of ["", "   "]) assert.deepEqual(lines(run(1, text)), [[0, 1200, 1020, 0]])
  })
  it("전각 공백은 기존 글꼴 줄 높이 계산에 계속 참여한다", () => {
    assert.deepEqual(lines(run(2, "　")), [[0, 1320, 1020, 0]])
  })
  it("fontLineHeight가 꺼진 문단은 명목 기준선을 유지한다", () => {
    assert.deepEqual(lines(run(0, "가") + run(1, " "), head.replace('fontLineHeight="1"', 'fontLineHeight="0"')), [[0, 1200, 1020, 0]])
  })
  it("실제 영문 글자는 영문 글꼴의 줄 높이를 쓴다", () => {
    assert.deepEqual(lines(run(1, "A")), [[0, 1598, 1307, 0]])
  })
  it("다음 줄의 큰 공백은 앞 줄의 기준선을 바꾸지 않는다", () => {
    assert.deepEqual(lines(run(0, "가<hp:lineBreak/>나") + run(1, " ")).map(s => s.slice(1)), [[800, 687, 0], [1200, 1030, 0]])
  })
  it("저장된 줄 좌표를 유지한다", () => {
    assert.deepEqual(lines(run(0, "가") + run(1, " "), head, '<hp:linesegarray><hp:lineseg textpos="0" vertsize="777" baseline="888" spacing="999"/></hp:linesegarray>'), [[0, 777, 888, 999]])
  })
})
