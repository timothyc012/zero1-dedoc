import { test } from "node:test"
import assert from "node:assert/strict"
import { GermanOcrEngine } from "../src/ocr/engine-v6.js"
import type { OcrPageStats } from "../src/ocr/engine.js"

// (Zero1 포크) 독일어 v6 엔진의 눕혀 찍은 쪽 판정 — upstream 엔진의 orientPage 와 같은 계약.
// 검출 상자 대부분이 세로로 길면 샘플을 0·90·270 으로 읽어 보고, 돌린 쪽이 확실히 잘 읽히면
// stats.pageRotation 만 적고 빈 목록을 돌려준다(호출측이 래스터를 돌려 다시 부른다).

const W = 200, H = 300
const tallBoxes = () => {
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
    boxes.push({ x: 10 + col * 38, y: 10 + row * 58, w: 30, h: 50 })
  }
  return boxes // 25개, 전부 h >= w * 1.5
}

/** marker 위치(상자 안 로컬 픽셀)가 밝은 래스터 — crop 이 어느 회전에서 그 자리를 읽는지로 재인식 신뢰도를 흉내낸다 */
function page(marker: "top-left" | "top-right" | "bottom-left") {
  const rgba = new Uint8Array(W * H * 4)
  for (const b of tallBoxes()) {
    const [px, py] = marker === "top-left" ? [b.x, b.y]
      : marker === "top-right" ? [b.x + b.w - 1, b.y]
      : [b.x, b.y + b.h - 1]
    const o = (py * W + px) * 4
    rgba[o] = rgba[o + 1] = rgba[o + 2] = 255
    rgba[o + 3] = 255
  }
  return rgba
}

/** crop 첫 픽셀(0,0)이 밝으면 신뢰도 높게, 어두우면 균등 확률로 읽는 가짜 rec — 회전마다 다른 자리를 읽는 것만 검증한다 */
function fakeEngine() {
  const dict = ["A", "B", "C", "D", "E"], C = dict.length + 2, T = 4
  class Tensor { constructor(public type: string, public data: Float32Array, public dims: number[]) {} }
  return Object.assign(Object.create(GermanOcrEngine.prototype), {
    sameWidthRecBatch: 1, dict, ort: { Tensor },
    detect: async () => tallBoxes(),
    rec: {
      provider: "cpu", inputNames: ["in"], outputNames: ["out"],
      run: async (feeds: { in: InstanceType<typeof Tensor> }) => {
        const { data, dims } = feeds.in
        const [n, , h, w] = dims
        const logits = new Float32Array(n * T * C)
        for (let i = 0; i < n; i++) {
          const bright = data[i * 3 * h * w] > 0 // B 채널 정규화값 > 0 → 마커 픽셀
          for (let t = 0; t < T; t++) if (bright) logits[(i * T + t) * C + 1] = 20
        }
        return { out: { data: logits, dims: [n, T, C] } }
      },
    },
    sharp: () => { throw new Error("detect is stubbed") },
    det: { provider: "cpu", inputNames: ["in"], outputNames: ["out"], run: async () => { throw new Error("detect is stubbed") } },
  })
}

test("v6 눕혀 찍은 쪽 — 회전 신뢰도가 확실히 높으면 pageRotation 만 적고 빈 목록", async () => {
  const stats: OcrPageStats = { droppedLowConf: 0 }
  const items = await fakeEngine().recognizePage(page("top-right"), W, H, stats)
  assert.equal(stats.pageRotation, 90)
  assert.deepEqual(items, [])
})

test("v6 눕혀 찍은 쪽 — 그대로가 잘 읽히면 돌리지 않고 줄을 낸다", async () => {
  const stats: OcrPageStats = { droppedLowConf: 0 }
  const items = await fakeEngine().recognizePage(page("top-left"), W, H, stats)
  assert.equal(stats.pageRotation, undefined)
  assert.equal(items.length, 25)
})

test("v6 눕혀 찍은 쪽 — 세로로 긴 상자가 적으면 판정 자체를 건너뛴다", async () => {
  const engine = fakeEngine()
  Object.assign(engine, { detect: async () => tallBoxes().map(b => ({ x: b.x, y: b.y, w: b.h, h: b.w })) })
  const stats: OcrPageStats = { droppedLowConf: 0 }
  const items = await engine.recognizePage(page("top-left"), W, H, stats)
  assert.equal(items.length, 25)
})
