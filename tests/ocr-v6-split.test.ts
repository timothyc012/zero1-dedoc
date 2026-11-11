import { test } from "node:test"
import assert from "node:assert/strict"
import { splitBoxAtRowRules } from "../src/ocr/crop.js"
import { GermanOcrEngine } from "../src/ocr/engine-v6.js"
import type { OcrPageStats } from "../src/ocr/engine.js"

// (Zero1 포크) 독일어 v6 엔진의 표 괘선 가르기·두 줄 상자 갈라 읽기 — upstream 엔진과 같은 계약.
// 가짜 rec 는 리사이즈된 crop 에서 잉크 띠(연속 잉크 행) 개수로 판정한다:
// 띠 하나면 잘 읽은 한 줄(conf ≈ 0.94), 띠 둘이면 두 줄을 억지로 한 줄에 읽은 것(conf ≈ 0.83).

const W = 320, H = 220
const page = () => new Uint8Array(W * H * 4).fill(255)
const band = (rgba: Uint8Array, y0: number, y1: number, x0 = 10, x1 = 300) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = (y * W + x) * 4
    rgba[o] = rgba[o + 1] = rgba[o + 2] = 0
  }
}

/** 잉크 띠 하나 → "A" 0.94, 띠 둘 → "WORT WORT" 0.83 로 읽는 가짜 rec */
function fakeEngine(boxes: { x: number; y: number; w: number; h: number }[]) {
  const dict = ["A", "B", "C", "D", "E"], C = dict.length + 2, T = 4
  class Tensor { constructor(public type: string, public data: Float32Array, public dims: number[]) {} }
  return Object.assign(Object.create(GermanOcrEngine.prototype), {
    sameWidthRecBatch: 1, dict, ort: { Tensor },
    detect: async () => boxes,
    rec: {
      provider: "cpu", inputNames: ["in"], outputNames: ["out"],
      run: async (feeds: { in: InstanceType<typeof Tensor> }) => {
        const { data, dims } = feeds.in
        const [n, , h, w] = dims
        const logits = new Float32Array(n * T * C)
        const p = h * w
        for (let i = 0; i < n; i++) {
          let bands = 0, prevInk = false
          for (let y = 0; y < h; y++) {
            let ink = false
            for (let x = 0; x < w; x++) if (data[i * 3 * p + 2 * p + y * w + x] < -0.5) ink = true // R 정규화
            if (ink && !prevInk) bands++
            prevInk = ink
          }
          const two = bands >= 2
          for (let t = 0; t < T; t++) logits[(i * T + t) * C + (two ? t % 5 + 1 : 1)] = two ? 3.5 : 6
        }
        return { out: { data: logits, dims: [n, T, C] } }
      },
    },
    sharp: () => { throw new Error("detect is stubbed") },
    det: { provider: "cpu", inputNames: ["in"], outputNames: ["out"], run: async () => { throw new Error("detect is stubbed") } },
  })
}

test("splitBoxAtRowRules — 기울어진 상자는 괘선 자리에 맞춰 변을 잘라 따로 읽는다", () => {
  const box = { x: 10, y: 20, w: 100, h: 40,
    quad: [{ x: 12, y: 20 }, { x: 112, y: 22 }, { x: 110, y: 62 }, { x: 10, y: 60 }] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] }
  const [top, bottom] = splitBoxAtRowRules(box, [{ x1: 10, x2: 110, y1: 40, thicknessPx: 2 }])
  assert.equal(top.h + bottom.h, 36) // rule 2px + 각 1px 여유가 사라진다
  // 아래 조각 윗변은 왼·오른 옆변을 y=42 에서 잘라 옮긴 자리 — 낡은 quad 를 재사용하면 두 조각 모두 원래 40px 을 또 읽는다
  assert.ok(top.quad && bottom.quad)
  assert.ok(Math.abs(top.quad![3].x - 11.1) < 0.01) // 왼 옆변을 y=38 에서 잘라 옮긴 자리
  assert.ok(Math.abs(top.quad![3].y - 38) < 0.01 && Math.abs(bottom.quad![0].y - 42) < 0.01)
})

test("v6 recognizePage — 행 괘선으로 덮인 상자를 두 줄로 나눠 읽는다", async () => {
  const rgba = page()
  band(rgba, 24, 36); band(rgba, 56, 68)
  const engine = fakeEngine([{ x: 10, y: 20, w: 290, h: 52 }])
  const stats: OcrPageStats = { droppedLowConf: 0 }
  const items = await engine.recognizePage(rgba, W, H, stats, undefined,
    [], [{ x1: 10, x2: 300, y1: 46, thicknessPx: 2 }])
  assert.equal(items.length, 2)
  assert.ok(items[0].y < items[1].y)
})

test("v6 recognizePage — 두 줄 덮인 상자는 가운데 빈 행에서 갈라 두 조각 모두 확실하면 바꾼다", async () => {
  const rgba = page()
  for (let i = 0; i < 5; i++) band(rgba, 12 + i * 22, 24 + i * 22, 10, 110)
  band(rgba, 134, 146); band(rgba, 164, 176) // 한 상자 안 두 줄 — 사이 빈 행 17px
  const boxes = [0, 1, 2, 3, 4].map(i => ({ x: 10, y: 10 + i * 22, w: 100, h: 20 }))
    .concat([{ x: 10, y: 130, w: 300, h: 50 }])
  const engine = fakeEngine(boxes)
  const stats: OcrPageStats = { droppedLowConf: 0 }
  const items = await engine.recognizePage(rgba, W, H, stats)
  assert.equal(items.length, 7) // 한 줄 5 + 갈라 둔 2
  const split = items.filter(i => i.y >= 120)
  assert.equal(split.length, 2)
  assert.ok(split[0].y < split[1].y)
})
