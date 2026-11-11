/**
 * (Zero1 포크) OCR 줄을 PDF 좌표로 — 스캔 쪽에 보이지 않는 텍스트층을 까는 소비자(Zero1 PDF 앱·scan2pdf)용.
 *
 * `ParseSuccess.ocrLines`(upstream 계약: 쪽마다 OCR 래스터 px·scale·deskewAngle)를 `PdfOcrLine`(PDF pt, 회전 전 사용자 좌표,
 * 왼쪽 아래 원점 — PDFKit 쪽 좌표)으로 옮긴다. 쪽 상자·/Rotate 는 PDF 파서가 `OcrPageLines.view`·`rotate` 로 싣는다(없으면
 * 래스터 크기의 0 원점 쪽, 회전 0 — 이미지 입력).
 *
 * 1. OCR 방향 보정의 90° 회전을 풀고, 줄 중심을 기울기 보정 전 래스터 자리로 되돌린다. 폭·높이는 바로 선 줄 그대로
 * 2. 래스터 px → pdfium 이 그린 방향(/Rotate 적용)의 쪽 pt, 왼쪽 아래 원점
 * 3. /Rotate 를 풀어 회전 전 사용자 좌표로. 글 방향도 두 보정 회전과 /Rotate 를 함께 반영한다
 */

import type { OcrPageLines, PdfOcrLine } from "../types.js"

/** 좌표 자릿수 — 소수 둘째 자리 (0.01pt) */
const round2 = (v: number) => Math.round(v * 100) / 100

export function ocrLinesInPdfSpace(pages: readonly OcrPageLines[] | undefined, opts: { includeDropped?: boolean } = {}): PdfOcrLine[] {
  const out: PdfOcrLine[] = []
  for (const p of pages ?? []) {
    const originalW = p.pageRotation ? p.height : p.width
    const originalH = p.pageRotation ? p.width : p.height
    const [x1, y1, x2, y2] = p.view ?? [0, 0, originalW / p.scale, originalH / p.scale]
    const r = (((p.rotate ?? 0) % 360) + 360) % 360
    const W = x2 - x1, H = y2 - y1
    // pdfium 이 그린 쪽 높이(pt) — 90·270 이면 가로세로가 바뀐다
    const drawnH = r === 90 || r === 270 ? W : H
    const t = (p.deskewAngle * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
    const cx = (originalW - 1) / 2, cy = (originalH - 1) / 2
    const lineAngle = -p.deskewAngle - (p.pageRotation ?? 0)
    for (const l of p.lines) {
      if (!l.text.trim() || (l.dropped && !opts.includeDropped)) continue
      const x = l.box.x + l.box.w / 2, y = l.box.y + l.box.h / 2
      // rotateQuarter maps pixel indices with -1; box coordinates are continuous
      // pixel edges, so their centers map around the full width/height instead.
      const [ux, uy] = p.pageRotation === 90 ? [originalW - y, x]
        : p.pageRotation === 270 ? [y, originalH - x] : [x, y]
      const dx = ux - cx, dy = uy - cy
      const ox = c * dx - s * dy + cx, oy = s * dx + c * dy + cy
      const width = l.box.w / p.scale, height = l.box.h / p.scale
      const xd = ox / p.scale, yd = drawnH - oy / p.scale
      const [u, v] = r === 90 ? [W - yd, xd] : r === 180 ? [W - xd, H - yd] : r === 270 ? [yd, H - xd] : [xd, yd]
      const a = ((lineAngle + r + 180) % 360 + 360) % 360 - 180
      out.push({
        text: l.text,
        bbox: { page: p.pageNumber, x: round2(x1 + u - width / 2), y: round2(y1 + v - height / 2), width: round2(width), height: round2(height) },
        angle: a === -180 ? 180 : a,
        confidence: l.confidence,
      })
    }
  }
  return out
}
