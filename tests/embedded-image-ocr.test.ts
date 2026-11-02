/**
 * HWP·HWPX 삽입 그림 속 글 OCR (#143, embedded-image-ocr.ts).
 *
 * 잠근 계약:
 *  1. ocr 미지정·false 면 블록 불변(산출 불변) — OCR 함수를 부르지도 않는다
 *  2. ocr 함수(OcrProvider)·true 면 그림 블록 바로 뒤에 그림 속 글 블록을 넣는다 — 표 칸 안 그림도 그 칸 안에
 *  3. 가로·세로 24px 미만 장식 그림과 WMF·EMF 는 건너뛴다(형식은 경고 하나), 빈 결과면 아무것도 넣지 않는다
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { ocrEmbeddedImages } from "../src/ocr/embedded-image-ocr.js"
import type { IRBlock, ParseWarning } from "../src/types.js"

const png = async (w: number, h: number) => new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } }).png().toBuffer())
const image = (data: Uint8Array, filename: string, mimeType = "image/png"): IRBlock => ({ type: "image", text: filename, pageNumber: 2, imageData: { data, mimeType, filename } })

describe("ocrEmbeddedImages — 삽입 그림 속 글", () => {
  it("ocr 미지정·false 면 아무것도 바꾸지 않는다", async () => {
    const blocks = [image(await png(200, 80), "image_001.png")]
    const before = JSON.stringify(blocks)
    for (const ocr of [undefined, false] as const) {
      assert.equal(await ocrEmbeddedImages(blocks, { ocr }, []), false)
      assert.equal(JSON.stringify(blocks), before)
    }
  })

  it("그림 블록 바로 뒤에, 표 칸 안 그림은 그 칸 안에 글을 넣는다", async () => {
    const seen: string[] = []
    const ocr = async (img: Uint8Array, _p: number, mime: string) => { seen.push(mime); return `글 ${img.length > 0 ? "있음" : "없음"}` }
    const cellImage = image(await png(120, 60), "image_002.png")
    const blocks: IRBlock[] = [
      { type: "paragraph", text: "앞 문단", pageNumber: 2 },
      image(await png(200, 80), "image_001.png"),
      { type: "table", pageNumber: 2, table: { rows: 1, cols: 1, hasHeader: false, cells: [[{ text: "", colSpan: 1, rowSpan: 1, blocks: [cellImage] }]] } },
    ]
    assert.equal(await ocrEmbeddedImages(blocks, { ocr }, []), true)
    assert.deepEqual(blocks.map(b => b.type), ["paragraph", "image", "paragraph", "table"])
    assert.equal(blocks[2].text, "글 있음")
    assert.equal(blocks[2].pageNumber, 2)
    assert.deepEqual(blocks[3].table!.cells[0][0].blocks!.map(b => b.type), ["image", "paragraph"])
    assert.equal(seen.length, 2)
  })

  it("장식 그림(24px 미만)·벡터 그림(WMF·EMF)·빈 결과는 넣지 않는다", async () => {
    let calls = 0
    const ocr = async () => { calls++; return "" }
    const blocks = [image(await png(10, 200), "bullet.png"), image(new Uint8Array([1, 2, 3]), "logo.wmf", "image/wmf"), image(await png(200, 80), "image_003.png")]
    const warnings: ParseWarning[] = []
    assert.equal(await ocrEmbeddedImages(blocks, { ocr }, warnings), false)
    assert.equal(blocks.length, 3)
    assert.equal(calls, 1) // 200×80 그림만 불렀고 결과가 비었다
    assert.deepEqual(warnings.map(w => w.code), ["SKIPPED_IMAGE"])
  })
})
