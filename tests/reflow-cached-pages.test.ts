import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${ns}><hh:refList><hh:charProperties><hh:charPr id="0" height="1200"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"/></hh:paraProperties></hh:refList></hh:head>`

function nextPosition(lines: Array<[number, number, number]>) {
  const cached = `<hp:linesegarray>${lines.map(([y, h, s], i) => `<hp:lineseg textpos="${i}" vertpos="${y}" vertsize="${h}" textheight="${h}" spacing="${s}"/>`).join("")}</hp:linesegarray>`
  const doc = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>저장 문단</hp:t></hp:run>${cached}</hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>끝표식</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
  const root = doc.documentElement as unknown as Element
  const ps = root.getElementsByTagName("hp:p")
  const original = ps[0].getElementsByTagName("hp:linesegarray")[0].toString()
  reflowSection(root, parseRenderStyles(head), { BODY_W: 48190, BODY_H: 70018 })
  assert.equal(ps[0].getElementsByTagName("hp:linesegarray")[0].toString(), original)
  return Number(ps[1].getElementsByTagName("hp:lineseg")[0].getAttribute("vertpos"))
}

describe("부분 편집 문서의 저장된 쪽 좌표", () => {
  it("쪽을 넘긴 저장 문단의 마지막 쪽 아래에서 다음 문단을 시작한다", () => {
    assert.equal(nextPosition([[64800, 1200, 1200], [0, 1200, 1200], [60000, 1200, 1200]]), 62400)
  })
  it("여러 쪽·단을 넘겨도 마지막 좌표 구간만 사용한다", () => {
    assert.equal(nextPosition([[64800, 1200, 1200], [0, 1200, 1200], [60000, 1200, 1200], [0, 1200, 1200]]), 2400)
  })
  it("같은 높이의 줄 조각은 가장 낮은 바닥을 유지한다", () => {
    assert.equal(nextPosition([[50000, 1200, 1200], [0, 3000, 1000], [0, 1200, 1200]]), 4000)
  })
  it("좌표가 증가하는 문단은 이전 동작을 유지한다", () => {
    assert.equal(nextPosition([[0, 1200, 1200], [2400, 1200, 1200], [4800, 1200, 1200]]), 7200)
  })
})
