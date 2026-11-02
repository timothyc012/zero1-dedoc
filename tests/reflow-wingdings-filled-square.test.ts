import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { glyphWidth } from "../src/render/reflow.js"
import { fontAdvanceEm1000 } from "../src/hwpx/font-metrics.js"

describe("Wingdings 채운 사각 기호의 대체 폭", () => {
  it("F06E의 hmtx1529/upem2048을 정수 PDF 폭746으로 미리 버리지 않는다", () => {
    assert.equal(fontAdvanceEm1000("맑은 고딕", 0xf06e), 1529 / 2048 * 1000)
    const style = { height: 1300, face: "맑은 고딕", bold: false, italic: false, underline: false, ratio: 100, spacing: 0 }
    assert.equal(glyphWidth("\uf06e", style).w, 972)
  })
  it("일반 사각 기호와 원래 글꼴의 명시적 폭은 유지한다", () => {
    assert.equal(fontAdvanceEm1000("맑은 고딕", 0x25a0), 1000)
    assert.equal(fontAdvanceEm1000("한컴 고딕", 0xf0a7), 458)
  })
})
