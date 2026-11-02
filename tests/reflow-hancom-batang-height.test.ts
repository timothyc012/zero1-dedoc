import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
function lines(text: string, opts: { face?: string; type?: string; fontLineHeight?: number; vertical?: string; latin?: string; cache?: string } = {}) {
  const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="${opts.face ?? "한컴바탕"}" type="${opts.type ?? "TTF"}"/></hh:fontface><hh:fontface lang="LATIN"><hh:font id="0" face="${opts.latin ?? opts.face ?? "한컴바탕"}" type="${opts.type ?? "TTF"}"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1200"><hh:fontRef hangul="0" latin="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0" fontLineHeight="${opts.fontLineHeight ?? 1}"><hh:align horizontal="LEFT" vertical="${opts.vertical ?? "BASELINE"}"/><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr></hh:paraProperties></hh:head>`
  const root = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run>${opts.cache ?? ""}</hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
  return Array.from(root.getElementsByTagName("hp:lineseg"), s => ["textpos", "vertsize", "baseline", "spacing"].map(a => Number(s.getAttribute(a))))
}
describe("TTF 한컴바탕의 글꼴 줄 기준선", () => {
  it("임베드 글꼴의 ascent879/1024로 기준선을 정하고 명목 줄높이는 유지한다", () => {
    assert.deepEqual(lines("가. 감점기준"), [[0, 1200, 1030, 720]])
  })
  it("빈 문단과 ASCII 공백뿐인 줄은 명목 기준선을 유지한다", () => {
    for (const text of ["", "  "]) assert.deepEqual(lines(text), [[0, 1200, 1020, 720]])
  })
  it("글꼴 줄높이를 끈 문단은 명목 기준선을 유지한다", () => {
    assert.deepEqual(lines("가나다", { fontLineHeight: 0 }), [[0, 1200, 1020, 720]])
  })
  it("확인하지 않은 같은 이름의 HFT는 기존 명목 기준선을 유지한다", () => {
    assert.deepEqual(lines("가나다", { type: "HFT" }), [[0, 1200, 1020, 720]])
  })
  it("알 수 없는 글꼴과 이름이 비슷한 다른 글꼴은 기존 높이를 유지한다", () => {
    for (const face of ["미상 글꼴", "한컴바탕체"]) assert.deepEqual(lines("가나다", { face }), [[0, 1200, 1020, 720]])
  })
  it("실제로 선택된 영문 글꼴이 한컴바탕이면 그 글꼴의 기준선을 쓴다", () => {
    assert.deepEqual(lines("ABC", { face: "미상 글꼴", latin: "한컴바탕" }), [[0, 1200, 1030, 720]])
  })
  it("명시적인 문단 세로 정렬은 계속 우선한다", () => {
    for (const [vertical, baseline] of [["TOP", 0], ["CENTER", 600], ["BOTTOM", 1200]] as const) assert.equal(lines("가나다", { vertical })[0][2], baseline)
  })
  it("저장된 줄 기하는 바꾸지 않는다", () => {
    assert.deepEqual(lines("가나다", { cache: '<hp:linesegarray><hp:lineseg textpos="0" vertsize="777" baseline="888" spacing="999"/></hp:linesegarray>' }), [[0, 777, 888, 999]])
  })
})
