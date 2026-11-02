import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { glyphWidth } from "../src/render/reflow.js"
import { DEFAULT_CHAR, type RenderCharStyle } from "../src/render/head-styles.js"

const style = (more: Partial<RenderCharStyle> = {}): RenderCharStyle => ({ ...DEFAULT_CHAR, face: "신명조", height: 1400, before2024: true, hft: false, ...more })
describe("구버전 TTF 신명조의 큰따옴표", () => {
  it("원본 PDF에서 사용된 대체 글꼴의 370/1000em 폭을 적용한다", () => {
    for (const ch of ["“", "”"]) assert.deepEqual(glyphWidth(ch, style()), { w: 520, sp: 0 })
  })
  it("영문 언어 글꼴이 신명조인 경우에도 같은 폭이다", () => {
    assert.equal(glyphWidth("“", style({ face: "바탕", latin: { face: "신명조", ratio: 100, spacing: 0, rel: 100, hft: false } })).w, 520)
  })
  it("명시적 영문 언어 글꼴의 HFT 여부를 따른다", () => {
    assert.equal(glyphWidth("“", style({ latin: { face: "신명조", ratio: 100, spacing: 0, rel: 100, hft: true } })).w, 1400)
  })
  it("같은 이름의 HFT와 최신판에는 검증하지 않은 폭을 적용하지 않는다", () => {
    for (const st of [style({ hft: true }), style({ before2024: false }), style({ halfQuote: true })]) assert.equal(glyphWidth("“", st).w, 1400)
  })
  it("언어별 글꼴명이 없으면 상속한 기본 글꼴의 HFT 여부를 따른다", () => {
    assert.equal(glyphWidth("“", style({ hft: true, latin: { ratio: 100, spacing: 0, rel: 100 } })).w, 1400)
  })
  it("별도 글꼴인 한양신명조의 441/1000em 폭은 유지한다", () => {
    assert.equal(glyphWidth("“", style({ face: "한양신명조", hft: true })).w, 616)
  })
  it("영문 글꼴이 다르면 그 언어의 기존 폭을 유지한다", () => {
    assert.deepEqual(glyphWidth("“", style({ latin: { face: "맑은 고딕", ratio: 100, spacing: 0, rel: 100 } })), glyphWidth("“", style({ face: "맑은 고딕" })))
  })
  it("부분 보정으로 한글·ASCII·작은따옴표의 기존 폭을 유지한다", () => {
    for (const ch of ["가", "A", "0", " ", "‘", "’"]) assert.deepEqual(glyphWidth(ch, style()), glyphWidth(ch, style({ before2024: false })))
  })
})
