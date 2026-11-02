import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { deskewPage, rotateRgba } from "../src/ocr/deskew.js"
import { DEFAULT_BUILTIN_OCR, ocrOnePage } from "../src/ocr/pdf-ocr.js"
import type { OcrItem } from "../src/ocr/engine.js"

const W = 600, H = 800

/** A tilted page with enough separate ink rows to trigger real deskew. */
function raster(): Uint8Array {
  const rgba = new Uint8Array(W * H * 4).fill(255)
  for (let row = 0; row < 20; row++) {
    for (let y = 60 + row * 34; y < 74 + row * 34; y++) {
      for (let x = 60; x < W - 60; x++) {
        if (x % 14 > 10) continue
        const i = (y * W + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 0
      }
    }
  }
  return rotateRgba(rgba, W, H, -2)
}

function page(rgba: Uint8Array): Parameters<typeof ocrOnePage>[0] {
  return {
    getOriginalSize: () => ({ originalWidth: W / 3, originalHeight: H / 3 }),
    render: async ({ scale }: { scale: number }) => {
      if (scale === 3) return { data: rgba, width: W, height: H }
      assert.equal(scale, 6)
      const hi = new Uint8Array(W * H * 16)
      for (let y = 0; y < H * 2; y++) for (let x = 0; x < W * 2; x++) {
        const from = ((y >> 1) * W + (x >> 1)) * 4
        hi.set(rgba.subarray(from, from + 4), (y * W * 2 + x) * 4)
      }
      return { data: hi, width: W * 2, height: H * 2 }
    },
  } as unknown as Parameters<typeof ocrOnePage>[0]
}

const item = (text: string, x: number, y: number, confidence: number): OcrItem =>
  ({ text, x, y, w: 60, h: 12, confidence })

describe("PDF OCR region coordinates", () => {
  it("keeps whole-page and closer reads in the original region coordinate system", async () => {
    const rgba = raster()
    assert.ok(deskewPage(rgba, W, H).angle > 1, "fixture must trigger deskew")
    let calls = 0
    let wholeRaster: Uint8Array | undefined
    const engine = {
      recognizePage: async (input: Uint8Array) => {
        calls++
        if (calls === 1) {
          wholeRaster = input
          return [item("whole first", 90, 120, 0.6), item("whole second", 90, 420, 0.99)]
        }
        // Crop coordinates: both regions start at x=60 and y=90/390 in the page raster.
        return [item(calls === 2 ? "closer first" : "closer second", 60, 60, calls === 2 ? 0.99 : 0.5)]
      },
    } as unknown as Parameters<typeof ocrOnePage>[3]
    const regions = [90, 390].map(y => ({ x1: 20, x2: 80, y1: (H - y - 120) / 3, y2: (H - y) / 3 }))
    const result = await ocrOnePage(page(rgba), 1, "builtin", engine, [], false, undefined, regions,
      { ...DEFAULT_BUILTIN_OCR, lines: "kept" })
    assert.equal(calls, 3, "must exercise both high-resolution crop reads")
    assert.equal(result.lines?.regionsOnly, true)
    assert.equal(result.lines?.deskewAngle, 0, "all returned boxes use original PDF raster coordinates")
    assert.deepEqual(wholeRaster, rgba, "region filtering must use the same raster as closer reads")
    assert.deepEqual(result.lines?.lines.map(l => l.text), ["closer first", "whole second"])
    assert.deepEqual(result.lines?.lines.map(l => l.box), [
      { x: 90, y: 120, w: 30, h: 6 },
      { x: 90, y: 420, w: 60, h: 12 },
    ])
    assert.match(result.blocks.map(b => "text" in b ? b.text : "").join(" "), /closer first/)
  })

  it("still deskews a full scanned page", async () => {
    const rgba = raster()
    const engine = { recognizePage: async () => [item("scan", 90, 120, 0.99)] } as unknown as Parameters<typeof ocrOnePage>[3]
    const result = await ocrOnePage(page(rgba), 1, "builtin", engine, [], false, undefined, undefined,
      { ...DEFAULT_BUILTIN_OCR, lines: "kept" })
    assert.ok(result.lines!.deskewAngle > 1)
    assert.equal(result.lines?.regionsOnly, undefined)
  })
})
