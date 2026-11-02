import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const run = (id: number, text: string) => `<hp:run charPrIDRef="${id}"><hp:t>${text}</hp:t></hp:run>`
function lines(body = run(0, "가나다") + run(1, "라마"), fl = false) {
  const head = `<hh:head ${ns}><hh:charProperties><hh:charPr id="0" height="1400"/><hh:charPr id="1" height="1500"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0" fontLineHeight="${fl ? 1 : 0}"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:lineSpacing type="PERCENT" value="140"/></hh:paraPr></hh:paraProperties></hh:head>`
  const root = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0">${body}</hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 4200, BODY_H: 80000 })
  return Array.from(root.getElementsByTagName("hp:lineseg"), s => Object.fromEntries(["textpos", "vertpos", "vertsize", "textheight", "baseline", "spacing"].map(k => [k, Number(s.getAttribute(k))])))
}
describe("다음 줄에서 시작하는 큰 run의 점유 높이", () => {
  it("앞줄 점유 높이만 늘리고 글높이·기준선·간격·다음줄 위치는 유지한다", () => {
    assert.deepEqual(lines(), [
      { textpos: 0, vertpos: 0, vertsize: 1500, textheight: 1400, baseline: 1190, spacing: 560 },
      { textpos: 3, vertpos: 1960, vertsize: 1500, textheight: 1500, baseline: 1275, spacing: 600 },
    ])
  })
  it("다음 줄 뒤쪽의 큰 run은 앞줄 점유 높이에 넣지 않는다", () => {
    assert.equal(lines(run(0, "가나다라") + run(1, "마"))[0].vertsize, 1400)
  })
  it("경계의 빈 run은 큰 글자로 취급하지 않는다", () => {
    assert.equal(lines(run(0, "가나다") + run(1, "") + run(0, "라마"))[0].vertsize, 1400)
  })
  it("공백에서 시작한 run은 앞줄 점유 높이에 넣지 않는다", () => {
    const first = lines(run(0, "가나다") + run(1, " 라"))[0]
    assert.equal(first.vertsize, first.textheight)
  })
  it("글꼴 줄높이를 쓰거나 개체가 있는 문단에는 적용하지 않는다", () => {
    const first = lines(undefined, true)[0]
    assert.equal(first.vertsize, first.textheight)
    const pic = '<hp:run charPrIDRef="0"><hp:pic><hp:sz width="100" height="100"/><hp:pos treatAsChar="1"/></hp:pic></hp:run>'
    const objectLine = lines(pic + run(0, "가나다") + run(1, "라마"))[0]
    assert.equal(objectLine.vertsize, objectLine.textheight)
  })
  it("마지막 줄은 자체 높이를 유지한다", () => {
    assert.equal(lines(run(0, "가나다"))[0].vertsize, 1400)
  })
  it("원본 두 문서처럼 명시적 줄바꿈의 큰 run도 앞줄 점유 높이에 포함한다", () => {
    assert.equal(lines(run(0, "가나<hp:lineBreak/>") + run(1, "라마"))[0].vertsize, 1500)
  })
  it("NBSP와 전각 공백 경계는 자체 글높이보다 넓히지 않는다", () => {
    for (const space of ["\u00a0", "\u3000"]) {
      const first = lines(run(0, "가나다") + run(1, space + "라"))[0]
      assert.equal(first.vertsize, first.textheight)
    }
  })
})
