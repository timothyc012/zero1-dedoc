import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { trimInklessEnds } from "../src/ocr/glyph-restore.js"

// 240×30 상자, 배경 232(표지 무늬 띠의 연한 파랑). 글자 자리는 20px 칸(stepPx 10, 칸 k 의 가운데 = steps 2k)
const W = 240, H = 30
function page(paint: (x: number, y: number) => number | undefined): Uint8Array {
  const rgba = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = paint(x, y) ?? 232, p = (y * W + x) * 4
    rgba[p] = rgba[p + 1] = rgba[p + 2] = v; rgba[p + 3] = 255
  }
  return rgba
}
const box = { x: 0, y: 0, w: W, h: H }
const steps = (n: number) => Array.from({ length: n }, (_, k) => 2 * k)
/** 칸 k 에 v 밝기 글자 덩어리 */
const glyph = (cells: number[], v: number) => (x: number, y: number) =>
  y >= 6 && y < 24 && cells.some(k => x >= k * 20 + 4 && x < k * 20 + 16) ? v : undefined

describe("OCR 줄 끝 무늬 글자 떼기", () => {
  it("배경보다 밝은 무늬 자리 글자를 줄 머리에서 떼고, 높이를 덮는 세로 괘선은 잉크로 치지 않는다", () => {
    const pattern = glyph([0, 1, 2, 3], 255), ink = glyph([6, 7, 8], 60)
    const rgba = page((x, y) => (x === 50 || x === 51 ? 90 : undefined) ?? ink(x, y) ?? pattern(x, y))
    const r = trimInklessEnds(rgba, W, box, "D①D①①①정치관", steps(9), 10)
    assert.equal(r.text, "정치관")
    assert.deepEqual(r.steps, [12, 14, 16])
  })

  it("연한 회색 글씨·어두운 띠 위 흰 글씨는 그대로, 남는 글자가 없으면 그대로", () => {
    const rgba = page((x, y) => glyph([0, 1], 170)(x, y) ?? glyph([3, 4], 60)(x, y))
    assert.equal(trimInklessEnds(rgba, W, box, "참고 정치", steps(5), 10).text, "참고 정치")
    const white = page((x, y) => glyph([3, 4], 255)(x, y) ?? (x >= 50 ? 90 : undefined) ?? glyph([0, 1], 60)(x, y))
    assert.equal(trimInklessEnds(white, W, box, "정치 RE", steps(5), 10).text, "정치 RE")
    const blank = page(() => undefined)
    assert.equal(trimInklessEnds(blank, W, box, "①①", steps(2), 10).text, "①①")
  })
})
