/**
 * OCR 줄 좌표 (ParseOptions.ocrLines) — 텍스트층 없는 쪽에 보이지 않는 글을 깔 수 있게 줄마다 글·상자·기울기·신뢰도 (src/ocr/pdf-ocr.ts)
 *
 * 잠근 계약:
 *  1. 상자는 PDF pt, 왼쪽 아래 원점 — 래스터 px(왼쪽 위 원점, y 아래)에서 환산
 *  2. 기울기 보정한 쪽은 줄 중심을 원래 쪽 자리로 되돌리고, angle 은 보정 각의 반대(반시계 양수)
 *  3. ocrLines 를 켜지 않으면 결과에 없다 (기본 출력 불변)
 *  4. /Rotate 쪽도 회전 전 사용자 좌표(PDFKit 쪽 좌표·본문 글과 같은 기준, CropBox 원점 포함)로 — pdfium 은 회전을 적용해 그린다
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parse } from "../src/index.js"
import { ocrItemsToLines, ocrLineToUserSpace } from "../src/ocr/pdf-ocr.js"
import { getOcrModelStatus } from "../src/ocr/models.js"

describe("ocrItemsToLines — 래스터 px → 원래 쪽 PDF pt", () => {
  it("보정 없는 쪽: 왼쪽 위 원점 px 를 왼쪽 아래 원점 pt 로", () => {
    // 래스터 200×100px = 쪽 100×50pt (scale 2)
    const [line] = ocrItemsToLines([{ text: "가나", x: 20, y: 10, w: 40, h: 10, confidence: 0.9 }], 3, 50, 2, 0, 200, 100)
    assert.deepEqual(line, { text: "가나", bbox: { page: 3, x: 10, y: 40, width: 20, height: 5 }, angle: 0, confidence: 0.9 })
  })

  it("보정한 쪽: 바로 세운 래스터의 줄 중심을 원래 자리로 되돌린다", () => {
    // 보정 90°(화면상 반시계): 바로 세운 래스터에서 중심 오른쪽 10px 에 있는 줄은 원래 중심 아래 10px 에 있었다
    const [line] = ocrItemsToLines([{ text: "줄", x: 108, y: 99, w: 4, h: 2, confidence: 0.8 }], 1, 201, 1, 90, 201, 201)
    assert.equal(line.angle, -90)
    const { x, y, width, height } = line.bbox
    assert.deepEqual({ cx: x + width / 2, cy: y + height / 2, width, height }, { cx: 100, cy: 91, width: 4, height: 2 })
  })

  it("빈 글 줄은 뺀다", () => {
    assert.equal(ocrItemsToLines([{ text: "  ", x: 0, y: 0, w: 4, h: 2, confidence: 0.5 }], 1, 10, 1, 0, 10, 10).length, 0)
  })
})

describe("ocrLineToUserSpace — 그린 방향(회전 적용) → 회전 전 사용자 좌표", () => {
  const line = (x: number, y: number, angle = 0) => ({ text: "줄", bbox: { page: 1, x, y, width: 20, height: 10 }, angle, confidence: 0.9 })
  const center = (l: ReturnType<typeof line>) => [l.bbox.x + l.bbox.width / 2, l.bbox.y + l.bbox.height / 2]

  it("회전 없는 쪽: CropBox 원점만 더한다", () => {
    const out = ocrLineToUserSpace(line(10, 20), [50, 30, 470, 630], 0)
    assert.deepEqual(center(out), [70, 55])
    assert.equal(out.angle, 0)
  })

  it("/Rotate 90: 그린 쪽 (xd, yd) 는 회전 전 (W − yd, xd), 글은 반시계 90° 누운 것", () => {
    // 회전 전 420×600 세로 쪽 → 그린 쪽 600×420 가로. 그린 쪽 중심 (300, 320) = 회전 전 (100, 300)
    const out = ocrLineToUserSpace(line(290, 315, 1), [0, 0, 420, 600], 90)
    assert.deepEqual(center(out), [100, 300])
    assert.deepEqual([out.bbox.width, out.bbox.height, out.angle], [20, 10, 91])
  })

  it("/Rotate 180·270", () => {
    assert.deepEqual(center(ocrLineToUserSpace(line(90, 45), [0, 0, 420, 600], 180)), [320, 550])
    const r270 = ocrLineToUserSpace(line(90, 45), [0, 0, 420, 600], 270)
    assert.deepEqual(center(r270), [50, 500])
    assert.equal(r270.angle, -90)
  })
})

/** 글자 없이 JPEG 한 장만 찍힌 한 쪽 PDF (스캔본 꼴) — 이미지는 쪽 pt 의 두 배 px */
function imagePdf(jpeg: Buffer, w: number, h: number, rotate = 0): ArrayBuffer {
  const parts: Buffer[] = []
  const offsets: number[] = []
  let len = 0
  const push = (b: Buffer | string) => { const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b; parts.push(buf); len += buf.length }
  const obj = (n: number, body: string, stream?: Buffer) => {
    offsets[n] = len
    push(`${n} 0 obj\n`); push(body)
    if (stream) { push("\nstream\n"); push(stream); push("\nendstream") }
    push("\nendobj\n")
  }
  const content = Buffer.from(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`, "latin1")
  push("%PDF-1.4\n")
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}]${rotate ? ` /Rotate ${rotate}` : ""} /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${w * 2} /Height ${h * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
  obj(5, `<< /Length ${content.length} >>`, content)
  const xref = len
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const all = Buffer.concat(parts)
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer
}

/** 가운데 맞춘 글줄 6개를 쪽 중심 기준 시계 방향 tiltDeg 만큼 기울인 스캔 쪽 (420×600pt) */
async function tiltedScan(tiltDeg: number): Promise<ArrayBuffer | null> {
  let sharp: typeof import("sharp")["default"]
  try { sharp = (await import("sharp")).default } catch { return null }
  const lines = ["대한민국 정부 보고서", "행정안전부 업무 계획", "지방자치 단체 협력", "예산 집행 현황 점검", "주민 의견 수렴 결과", "향후 추진 일정 안내"]
  const text = lines.map((s, i) => `<text x="420" y="${160 + i * 170}" font-size="56" text-anchor="middle" font-family="sans-serif">${s}</text>`).join("")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1200"><rect width="840" height="1200" fill="white"/><g transform="rotate(${tiltDeg} 420 600)">${text}</g></svg>`
  return imagePdf(await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer(), 420, 600)
}

/** 가로로 스캔해 세로 쪽(420×600pt)에 눕혀 담고 /Rotate 90 으로 바로 보이게 한 쪽 — 글 3줄, 가로 기준 가운데 맞춤 */
async function rotatedScan(): Promise<ArrayBuffer | null> {
  let sharp: typeof import("sharp")["default"]
  try { sharp = (await import("sharp")).default } catch { return null }
  const lines = ["대한민국 정부 보고서", "행정안전부 업무 계획", "지방자치 단체 협력"]
  const text = lines.map((s, i) => `<text x="600" y="${220 + i * 180}" font-size="56" text-anchor="middle" font-family="sans-serif">${s}</text>`).join("")
  const land = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840"><rect width="1200" height="840" fill="white"/>${text}</svg>`)).png().toBuffer()
  return imagePdf(await sharp(land).rotate(-90).jpeg({ quality: 92 }).toBuffer(), 420, 600, 90)
}

describe("parse({ ocrLines: true }) — 스캔 PDF", () => {
  it("켜지 않으면 ocrLines 가 없다", async (t) => {
    if (!(await getOcrModelStatus()).every(s => s.exists)) { t.skip("OCR 모델 미설치"); return }
    const pdf = await tiltedScan(0)
    if (!pdf) { t.skip("sharp 미설치"); return }
    const r = await parse(pdf, { ocr: true })
    assert.ok(r.success)
    assert.equal(r.success && "ocrLines" in r, false)
  })

  it("기운 스캔: 맨 윗줄 중심이 원래 쪽 자리에, angle 은 시계 방향 기울기", async (t) => {
    if (!(await getOcrModelStatus()).every(s => s.exists)) { t.skip("OCR 모델 미설치"); return }
    const pdf = await tiltedScan(2)
    if (!pdf) { t.skip("sharp 미설치"); return }
    const r = await parse(pdf, { ocr: true, ocrLines: true })
    assert.ok(r.success && r.ocrLines?.length, "ocrLines 없음")
    const lines = r.success ? r.ocrLines! : []
    for (const l of lines) {
      assert.equal(l.bbox.page, 1)
      assert.ok(l.text.trim() && l.confidence > 0 && l.confidence <= 1, JSON.stringify(l))
      assert.ok(Math.abs(l.angle - -2) <= 0.4, `angle ${l.angle}`)
    }
    // 맨 윗줄: 기울기 전 중심 (210, 600 − 80 + 14)pt 쯤 — 쪽 중심(210,300) 기준 시계 2° 돌리면 오른쪽으로 ~7.8pt 밀린다
    const top = lines.reduce((a, b) => (b.bbox.y > a.bbox.y ? b : a))
    const cx = top.bbox.x + top.bbox.width / 2, cy = top.bbox.y + top.bbox.height / 2
    const dy = cy - 300, th = (2 * Math.PI) / 180
    // 시계 방향(쪽 좌표 y 위) 회전: 윗줄(dy>0)은 오른쪽으로 dy·sinθ
    const expectedCx = 210 + dy * Math.sin(th) / Math.cos(th)
    assert.ok(Math.abs(cx - expectedCx) <= 3, `top line cx ${cx.toFixed(1)} expected ~${expectedCx.toFixed(1)} (${top.text})`)
    assert.ok(Math.abs(cx - 210) > 4, `되돌리지 않은 좌표로 보임: cx ${cx.toFixed(1)}`)
  })

  it("/Rotate 90 쪽: 회전 전 세로 쪽 좌표로, angle 90", async (t) => {
    if (!(await getOcrModelStatus()).every(s => s.exists)) { t.skip("OCR 모델 미설치"); return }
    const pdf = await rotatedScan()
    if (!pdf) { t.skip("sharp 미설치"); return }
    const r = await parse(pdf, { ocr: true, ocrLines: true })
    const lines = r.success ? r.ocrLines ?? [] : []
    assert.equal(lines.length, 3, JSON.stringify(lines))
    for (const l of lines) {
      assert.equal(l.angle, 90)
      const cx = l.bbox.x + l.bbox.width / 2, cy = l.bbox.y + l.bbox.height / 2
      assert.ok(cx > 0 && cx < 420 && cy > 0 && cy < 600, `세로 쪽 밖: ${cx},${cy}`)
      // 가로 쪽 가운데 맞춘 글 → 회전 전 쪽에서는 세로 가운데(y≈300)
      assert.ok(Math.abs(cy - 300) <= 6, `cy ${cy}`)
    }
    // 가로 쪽 맨 윗줄(윗변 쪽)은 회전 전 세로 쪽의 왼쪽 — 줄이 아래로 갈수록 오른쪽
    const xs = lines.map(l => l.bbox.x + l.bbox.width / 2)
    assert.ok(xs[0] < xs[1] && xs[1] < xs[2] && xs[0] < 130, JSON.stringify(xs))
  })
})
