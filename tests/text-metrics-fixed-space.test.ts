import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { simulateWrap, prepareWrap, measureTextWidth } from "../src/hwpx/text-metrics.js"

describe("고정폭 빈칸의 줄 나눔", () => {
  it("고정폭 빈칸은 어절 경계이고 NBSP는 어절을 묶는다", () => {
    const opts = { widths: [1000, 500, 1000, 250, 1000], kinsoku: "hancom" as const }
    assert.deepEqual(simulateWrap("나 가\u2005가", 3000, 3000, 1000, 100, "keep", opts).starts, [0, 4])
    assert.deepEqual(simulateWrap("나 가\u00a0가", 3000, 3000, 1000, 100, "keep", opts).starts, [0, 2])
  })
  it("공백 최소값으로 고정폭 빈칸의 폭을 줄이지 않는다", () => {
    for (const kinsoku of [undefined, "hancom"] as const) {
      const opts = { widths: [1000, 250, 1000], condensePct: 50, kinsoku }
      assert.deepEqual(simulateWrap("가\u2005가", 2200, 2200, 1000, 100, "keep", opts).starts, [0, 2])
      assert.deepEqual(simulateWrap("가 가", 2200, 2200, 1000, 100, "keep", opts).starts, [0])
    }
  })
  it("줄 끝 고정폭 빈칸 뒤 부호 때문에 빈칸을 다음 줄로 옮기지 않는다", () => {
    const opts = { widths: [1000, 1000, 250, 300, 1000], kinsoku: "hancom" as const }
    assert.deepEqual(simulateWrap("가가\u2005·나", 2100, 2100, 1000, 100, "charAll", opts).starts, [0, 3])
  })
  it("영문 글자 나눔에서도 고정폭 빈칸을 단어에 붙이지 않는다", () => {
    const opts = { widths: [1000, 250, 1000], latinBreak: true, kinsoku: "hancom" as const }
    assert.deepEqual(simulateWrap("가\u2005가", 1100, 1100, 1000, 100, "keep", opts).starts, [0, 2])
  })
  it("이미 폭을 넘은 일반 빈칸 뒤의 고정폭 빈칸은 다음 줄 머리에 놓는다", () => {
    const opts = { widths: [1000, 1000, 500, 250, 1000], kinsoku: "hancom" as const }
    assert.deepEqual(simulateWrap("가가 \u2005나", 2200, 2200, 1000, 100, "charAll", opts).starts, [0, 3])
  })
  it("실폭을 주지 않는 계산과 준비된 계산도 1/4em 폭을 사용한다", () => {
    const text = "가\u2005나", expected = measureTextWidth(text, 1000, 100)
    for (const prepared of [undefined, prepareWrap(text, "keep")]) {
      const result = simulateWrap(text, expected, expected, 1000, 100, "keep", { prepared })
      assert.deepEqual(result.starts, [0])
      assert.equal(result.lastLineWidth, expected)
    }
  })
  it("보통 빈칸과 고정폭 빈칸이 섞여도 줄 시작과 글자 범위를 보존한다", () => {
    const text = "가 \u2005 \u2005나 다"
    for (const mode of ["keep", "charAll"] as const) {
      const result = simulateWrap(text, 1600, 1600, 1000, 100, mode, { kinsoku: "hancom" })
      assert.equal(result.starts[0], 0)
      assert.ok(result.starts.every((s, i) => s < text.length && (i === 0 || s > result.starts[i - 1])))
      assert.equal(result.starts.map((s, i) => text.slice(s, result.starts[i + 1])).join(""), text)
    }
  })
})
