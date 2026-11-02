/** 한컴 수식 글꼴(HyhwpEQ) 글 → $…$ 수식 스팬 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { wrapEquationRuns } from "../src/pdf/equation-runs.js"
import type { NormItem } from "../src/pdf/text-line.js"

const E = (c: number) => String.fromCodePoint(0xe000 + c)
const item = (text: string, x: number, y: number, w: number, fontSize = 9, fontName = "eq"): NormItem =>
  ({ text, x, y, w, h: fontSize, fontSize, fontName, isHidden: false })
const face = (f: string) => (f === "eq" ? "HyhwpEQ" : "HCRBatang")
const run = (items: NormItem[]) => { const list = [...items]; wrapEquationRuns(list, face); return list.map(i => i.text) }

describe("wrapEquationRuns", () => {
  it("분수 막대 위·아래를 \\frac 로 — sin(π−θ)=5/13", () => {
    const out = run([
      item("sin", 43, 476, 12),
      item(E(0x44), 58, 476, 3.5), item(E(0xac), 62, 476, 5), item(E(0x46), 68, 476, 6.8), item(E(0xa4), 76, 476, 4.2), item(E(0x45), 81, 476, 3.5),
      item(E(0x47), 87, 476, 7),
      item(E(0x6d), 96.5, 473, 11.6, 95), // 막대 — 가로로 늘려 찍어 글자 크기가 크게 잡힌다
      item(E(0x38), 100, 481, 4.5), // 분자 5
      item(E(0x34), 98, 470, 4.5), item(E(0x36), 102.4, 470, 4.5), // 분모 13
      item("이고", 110, 475, 18, 9, "body"),
    ])
    assert.deepEqual(out, ["$\\sin (\\pi -\\theta )=\\frac{5}{13}$", "이고"])
  })

  it("근호 윗줄 아래 글은 \\sqrt, 올라간 작은 글은 위첨자 — √8 × 4^(1/4)", () => {
    const out = run([
      item(E(0x5c), 40, 700, 5), item(E(0x6d), 45, 707, 5, 20), item(E(0x3b), 45, 700, 4.5), // √8
      item("×", 52, 700, 6),
      item(E(0x37), 60, 700, 4.5), // 4
      item(E(0x6d), 65, 705, 4, 12), item(E(0x34), 65, 708, 3, 6), item(E(0x37), 65, 702, 3, 6), // 위첨자 1/4
    ])
    assert.deepEqual(out, ["$\\sqrt{8}\\times 4^{\\frac{1}{4}}$"])
  })

  it("수식 글꼴 막대 위·아래의 본문 글꼴 글자도 분자·분모 — 배출농도 / 배출허용기준농도", () => {
    // 대기환경보전법 시행령 [별표 8] 비고: 막대만 수식 글꼴(가로로 늘려 크기 199), 한글 분자·분모는 본문 글꼴로 한 글자씩
    const chars = (s: string, x: number, y: number) => [...s].map((c, k) => item(c, x + k * 12, y, 12, 12, "body"))
    const out = run([
      ...chars("배출농도", 282, 421),
      item(E(0x6d), 256, 408, 100, 199),
      ...chars("배출허용기준농도", 258, 405),
    ])
    assert.deepEqual(out, ["$\\frac{\\text{배출농도}}{\\text{배출허용기준농도}}$"])
  })

  it("해독표에 없는 코드뿐인 조각은 버리고, 수식 글꼴이 아닌 글은 그대로", () => {
    assert.deepEqual(run([item(E(0x7b), 10, 500, 5), item("본문", 30, 500, 18, 9, "body")]), ["본문"])
  })

})
