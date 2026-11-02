/**
 * (Zero1 포크) OCR 줄 → PDF 좌표 (ocrLinesInPdfSpace) — Zero1 PDF 앱·scan2pdf 가 스캔 쪽에 보이지 않는 텍스트층을 깔 때 쓰는 계약
 *
 * 잠근 계약 (포크 v4.16.1-zero1 의 OcrLine 과 같다):
 *  1. 상자는 PDF pt, 왼쪽 아래 원점 — 래스터 px(왼쪽 위 원점, y 아래)에서 환산
 *  2. 기울기 보정한 쪽은 줄 중심을 원래 쪽 자리로 되돌리고, angle 은 보정 각의 반대(반시계 양수)
 *  3. /Rotate 쪽도 회전 전 사용자 좌표(PDFKit 쪽 좌표·본문 글과 같은 기준, CropBox 원점 포함)로 — pdfium 은 회전을 적용해 그린다
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { ocrLinesInPdfSpace } from "../src/index.js"
import type { OcrPageLines } from "../src/types.js"

const page = (o: Partial<OcrPageLines> & Pick<OcrPageLines, "width" | "height" | "scale" | "lines">): OcrPageLines =>
  ({ pageNumber: 1, deskewAngle: 0, ...o })
const center = (l: { bbox: { x: number; y: number; width: number; height: number } }) => [l.bbox.x + l.bbox.width / 2, l.bbox.y + l.bbox.height / 2]

describe("ocrLinesInPdfSpace — 래스터 px → 원래 쪽 PDF pt", () => {
  it("보정 없는 쪽: 왼쪽 위 원점 px 를 왼쪽 아래 원점 pt 로", () => {
    // 래스터 200×100px = 쪽 100×50pt (scale 2)
    const [line] = ocrLinesInPdfSpace([page({ pageNumber: 3, width: 200, height: 100, scale: 2, view: [0, 0, 100, 50], rotate: 0,
      lines: [{ text: "가나", box: { x: 20, y: 10, w: 40, h: 10 }, confidence: 0.9 }] })])
    assert.deepEqual(line, { text: "가나", bbox: { page: 3, x: 10, y: 40, width: 20, height: 5 }, angle: 0, confidence: 0.9 })
  })

  it("보정한 쪽: 바로 세운 래스터의 줄 중심을 원래 자리로 되돌린다", () => {
    // 보정 90°(화면상 반시계): 바로 세운 래스터에서 중심 오른쪽 10px 에 있는 줄은 원래 중심 아래 10px 에 있었다
    const [line] = ocrLinesInPdfSpace([page({ width: 201, height: 201, scale: 1, deskewAngle: 90, view: [0, 0, 201, 201],
      lines: [{ text: "줄", box: { x: 108, y: 99, w: 4, h: 2 }, confidence: 0.8 }] })])
    assert.equal(line.angle, -90)
    assert.deepEqual([...center(line), line.bbox.width, line.bbox.height], [100, 91, 4, 2])
  })

  it("빈 글 줄과 버린 줄(dropped)은 뺀다 — includeDropped 면 버린 줄도", () => {
    const p = page({ width: 10, height: 10, scale: 1, lines: [
      { text: "  ", box: { x: 0, y: 0, w: 4, h: 2 }, confidence: 0.5 },
      { text: "저", box: { x: 0, y: 0, w: 4, h: 2 }, confidence: 0.3, dropped: true },
    ] })
    assert.equal(ocrLinesInPdfSpace([p]).length, 0)
    assert.equal(ocrLinesInPdfSpace([p], { includeDropped: true }).length, 1)
  })

  it("쪽 상자가 없으면(이미지 입력) 래스터 크기의 0 원점 쪽", () => {
    const [line] = ocrLinesInPdfSpace([page({ width: 200, height: 100, scale: 2,
      lines: [{ text: "가", box: { x: 20, y: 10, w: 40, h: 10 }, confidence: 0.9 }] })])
    assert.deepEqual(line.bbox, { page: 1, x: 10, y: 40, width: 20, height: 5 })
  })
})

describe("ocrLinesInPdfSpace — 그린 방향(회전 적용) → 회전 전 사용자 좌표", () => {
  it("회전 없는 쪽: CropBox 원점만 더한다", () => {
    // 그린 쪽 420×600, 줄 중심 (20, 25)pt → 래스터 (20, 575)px
    const [line] = ocrLinesInPdfSpace([page({ width: 420, height: 600, scale: 1, view: [50, 30, 470, 630], rotate: 0,
      lines: [{ text: "줄", box: { x: 10, y: 570, w: 20, h: 10 }, confidence: 0.9 }] })])
    assert.deepEqual(center(line), [70, 55])
    assert.equal(line.angle, 0)
  })

  it("/Rotate 90: 그린 쪽 (xd, yd) 는 회전 전 (W − yd, xd), 글은 반시계 90° 누운 것", () => {
    // 회전 전 420×600 세로 쪽 → 그린 쪽 600×420 가로. 그린 쪽 중심 (300, 320) = 래스터 (300, 100) = 회전 전 (100, 300)
    const [line] = ocrLinesInPdfSpace([page({ width: 600, height: 420, scale: 1, view: [0, 0, 420, 600], rotate: 90,
      lines: [{ text: "줄", box: { x: 290, y: 95, w: 20, h: 10 }, confidence: 0.9 }] })])
    assert.deepEqual(center(line), [100, 300])
    assert.deepEqual([line.bbox.width, line.bbox.height, line.angle], [20, 10, 90])
  })

  it("/Rotate 180·270", () => {
    // 그린 쪽 중심 (100, 50)pt
    const r180 = ocrLinesInPdfSpace([page({ width: 420, height: 600, scale: 1, view: [0, 0, 420, 600], rotate: 180,
      lines: [{ text: "줄", box: { x: 90, y: 545, w: 20, h: 10 }, confidence: 0.9 }] })])[0]
    assert.deepEqual(center(r180), [320, 550])
    const r270 = ocrLinesInPdfSpace([page({ width: 600, height: 420, scale: 1, view: [0, 0, 420, 600], rotate: 270,
      lines: [{ text: "줄", box: { x: 90, y: 365, w: 20, h: 10 }, confidence: 0.9 }] })])[0]
    assert.deepEqual(center(r270), [50, 500])
    assert.equal(r270.angle, -90)
  })
})

describe("(Zero1) 독일어 셋의 손글씨 다시 읽기 모델", () => {
  it("ocrLanguage de + ocrRec auto 의 대체 모델은 v6 det 을 upstream 엔진에 넘기지 않는다", async () => {
    const { resolveOcrModels, handwritingFallbackModels, DEFAULT_OCR_MODELS } = await import("../src/ocr/models.js")
    const sel = resolveOcrModels({ ocrLanguage: "de", ocrRec: "auto" })
    assert.equal(sel.generation, 6)
    const alt = handwritingFallbackModels(sel)
    assert.equal(alt.generation, undefined)
    assert.equal(alt.det, DEFAULT_OCR_MODELS.det)
    assert.equal(alt.dict, DEFAULT_OCR_MODELS.dict)
  })
})
