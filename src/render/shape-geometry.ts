/** HWPX drawing geometry and paints, shared by the page renderer's shape regions. */
import { findChildByLocalName } from "../hwpx/parser-shared.js"
import { elements, ln, num, type ParaObj } from "./para-model.js"
import { docColor } from "./head-styles.js"

const pt = (u: number): string => String(Math.round(u) / 100)
const esc = (s: string): string => s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
export const SHAPE_TAGS = new Set(["rect", "ellipse", "line", "polygon", "curv", "curve", "arc"])
export interface RegionRotation { angle: number; cx: number; cy: number }
/** SVG matrix(a b c d e f) — x' = a·x + c·y + e, y' = b·x + d·y + f (HWPUNIT) */
export type Affine = [number, number, number, number, number, number]
interface Box { x: number; y: number; w: number; h: number }
export function rotatedBounds(box: Box, rotations: Array<RegionRotation | Affine>): Box {
  if (!rotations.length) return box
  let points = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]]
  // SVG nested groups apply the innermost transform first.
  for (let i = rotations.length - 1; i >= 0; i--) {
    const r = rotations[i]
    if (Array.isArray(r)) { points = points.map(([x, y]) => [r[0] * x + r[2] * y + r[4], r[1] * x + r[3] * y + r[5]]); continue }
    const { angle, cx, cy } = r
    const a = angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
    points = points.map(([x, y]) => [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)])
  }
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  return { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y }
}
export function mulAffine(m: Affine, n: Affine): Affine {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
}

/**
 * 묶음 안 개체의 renderingInfo — transMatrix·scaMatrix·rotMatrix 를 적힌 순서로 곱하면 개체 원본(orgSz) 좌표가 최상위 묶음의
 * 상자 좌표로 간다(e1 e2 e3 / e4 e5 e6 = x'·y' 행). 위례선 트램 보도자료 지도 묶음 실측: 지도 사진 48443×63972 → 0~42907 × 0~44754
 * (최상위 묶음 curSz 42907×44780), 노선 곡선 첫 점 → 지도 폭 0.77 지점(한컴 PDF 와 같다). 행렬이 없으면 null
 */
export function renderingMatrix(el: Element): Affine | null {
  const info = findChildByLocalName(el, "renderingInfo")
  if (!info) return null
  let m: Affine | null = null
  // 크기·회전 짝은 점에 크기를 먼저, 회전을 나중에 건다(R·S) — 한컴 PDF: 270° 회전 사진(세로 스캔 59580×84180)의 둘째 짝 크기가
  // 13889×21422 로 줄인 뒤 돌려 묶음 틀 21422×13889 를 꽉 채운다. 적힌 순서(S·R)로 곱하면 돌린 뒤 줄여 틀 밖으로 비뚤어졌다
  let pendingS: Affine | null = null
  const apply = (n: Affine): void => { m = m ? mulAffine(m, n) : n }
  for (const c of elements(info)) {
    const tag = ln(c)
    if (tag !== "transMatrix" && tag !== "scaMatrix" && tag !== "rotMatrix") continue
    const n: Affine = [num(c, "e1", 1), num(c, "e4"), num(c, "e2"), num(c, "e5", 1), num(c, "e3"), num(c, "e6")]
    if (tag === "scaMatrix") { if (pendingS) apply(pendingS); pendingS = n; continue }
    if (tag === "rotMatrix" && pendingS) { apply(mulAffine(n, pendingS)); pendingS = null; continue }
    apply(n)
  }
  if (pendingS) apply(pendingS)
  return m
}

export interface ObjectGeometry {
  x: number; y: number; w: number; h: number
  bbox: { x: number; y: number; w: number; h: number }
  transform: string
  rotation?: RegionRotation
}

/**
 * 회전 개체 — 한컴 저장본은 sz 가 틀(curSz)을 돌린 외접 상자이고 pos·offset 이 그 상자 자리다(회전 사진 ta-pic-001-r: 13668×12686 을
 * 34° 돌린 외접 18425×18160, rotationInfo center 가 그 상자 중심 · 270° 다각형 2536×4798 → sz 4798×2536). 틀 중심을 외접 상자(x, y, boxW, boxH)
 * 중심에 두고 그 점을 축으로 돌린다 — 다른 회전 중심도 같은 외접 상자에 놓이면 평행 이동만 다르다. 종전엔 틀을 상자 왼쪽 위에 두고
 * orgSz 비율로 중심을 잡아 실문서의 회전 도형이 어긋났고, 사진·묶음 개체는 회전을 읽지 않았다(#116)
 */
export function objectGeometry(el: Element, x: number, y: number, w: number, h: number, boxW = w, boxH = h): ObjectGeometry {
  const rot = findChildByLocalName(el, "rotationInfo")
  const angle = num(rot, "angle") % 360
  if (!angle) return { x, y, w, h, bbox: { x, y, w, h }, transform: "" }
  const cx = x + boxW / 2, cy = y + boxH / 2
  const fx = cx - w / 2, fy = cy - h / 2
  const rotation = { angle, cx: Math.round(cx), cy: Math.round(cy) }
  return { x: fx, y: fy, w, h, bbox: rotatedBounds({ x: fx, y: fy, w, h }, [rotation]), rotation, transform: `rotate(${angle} ${pt(cx)} ${pt(cy)})` }
}

interface PaintImage { dataUri: string; paintId?: string }
function shapeFill(el: Element, defs: string[], images: Map<string, PaintImage>, warn: (key: string, text: string) => void): string {
  const brush = findChildByLocalName(el, "fillBrush")
  const win = brush && findChildByLocalName(brush, "winBrush")
  const face = win?.getAttribute("faceColor")
  if (docColor(face)) return esc(face!)
  const grad = brush && findChildByLocalName(brush, "gradation")
  if (grad) {
    const colors = elements(grad).filter(c => ln(c) === "color").map(c => docColor(c.getAttribute("value"), "#000000")!)
    if (!colors.length) return "none"
    const type = grad.getAttribute("type") ?? "LINEAR"
    if (type !== "LINEAR" && type !== "RADIAL") {
      warn(`gradient:${type}`, `그라데이션(${type}) 미지원 — 첫 색으로 채움`)
      return esc(colors[0])
    }
    const id = `paint${defs.length}`
    const opacity = Math.max(0, Math.min(1, 1 - num(grad, "alpha") / 255))
    const stops = colors.map((color, i) => `<stop offset="${colors.length === 1 ? 0 : i / (colors.length - 1)}" stop-color="${esc(color)}" stop-opacity="${opacity}"/>`).join("")
    if (type === "RADIAL") defs.push(`<radialGradient id="${id}" cx="${num(grad, "centerX", 50)}%" cy="${num(grad, "centerY", 50)}%">${stops}</radialGradient>`)
    else {
      const a = num(grad, "angle") * Math.PI / 180, dx = Math.cos(a) / 2, dy = -Math.sin(a) / 2
      defs.push(`<linearGradient id="${id}" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">${stops}</linearGradient>`)
    }
    return `url(#${id})`
  }
  const imgBrush = brush && findChildByLocalName(brush, "imgBrush")
  const img = imgBrush && findChildByLocalName(imgBrush, "img")
  if (imgBrush && img) {
    const ref = img.getAttribute("binaryItemIDRef") ?? ""
    const loaded = images.get(ref)
    if (!loaded) { warn(`brush-image:${ref}`, `그림 채움 이미지(${ref}) 없음 — 채움 생략`); return "none" }
    const mode = imgBrush.getAttribute("mode") ?? "TOTAL"
    if (mode !== "TOTAL") { warn(`brush-mode:${mode}`, `그림 채움(${mode}) 미지원 — 채움 생략`); return "none" }
    if (loaded.paintId) return `url(#${loaded.paintId})`
    const id = `paint${defs.length}`
    // Embed in the paint definition; standalone page assembly can discard unused
    // image symbols without accidentally removing a pattern's referenced image.
    defs.push(`<pattern id="${id}" width="1" height="1" patternContentUnits="objectBoundingBox"><image href="${esc(loaded.dataUri)}" width="1" height="1" preserveAspectRatio="none"/></pattern>`)
    loaded.paintId = id
    return `url(#${id})`
  }
  return "none"
}

/** local — 묶음 안 개체를 원본(orgSz) 좌표로 그린다(배율·회전은 바깥 renderingInfo 행렬 그룹이 맡는다) */
export function shapeGeometry(o: ParaObj, boxX: number, boxY: number, defs: string[], images: Map<string, PaintImage>, warn: (key: string, text: string) => void, local = false): ObjectGeometry & { svg: string } {
  const el = o.el, org = findChildByLocalName(el, "orgSz"), cur = findChildByLocalName(el, "curSz")
  const ow = num(org, "width"), oh = num(org, "height")
  const w = (local ? ow : num(cur, "width")) || ow || num(cur, "width") || o.width
  const h = (local ? oh : num(cur, "height")) || oh || num(cur, "height") || o.height
  const geometry: ObjectGeometry = local ? { x: boxX, y: boxY, w, h, bbox: { x: boxX, y: boxY, w, h }, transform: "" }
    : objectGeometry(el, boxX, boxY, w, h, o.width || w, o.height || h)
  const { x, y } = geometry
  const sx = ow > 0 ? w / ow : 1, sy = oh > 0 ? h / oh : 1
  const line = findChildByLocalName(el, "lineShape"), style = line?.getAttribute("style") ?? "SOLID"
  const color = esc(docColor(line?.getAttribute("color"), "#000000")!)
  const strokeW = style === "NONE" ? 0 : Math.max(0.2, (num(line, "width", 33) / 100) * 2.834645)
  const dash = /DASH|DOT/.test(style) ? ` stroke-dasharray="${style.includes("DOT") ? "1,1.5" : "3,1.5"}"` : ""
  // 묶음 행렬 안(local)에서는 선 굵기를 배율로 늘리지 않는다 — 한컴은 묶음 크기를 바꿔도 선 굵기가 그대로
  const keepWidth = local ? ` vector-effect="non-scaling-stroke"` : ""
  const stroke = strokeW ? ` stroke="${color}" stroke-width="${strokeW.toFixed(2)}"${dash}${keepWidth}` : ""
  const fill = ` fill="${shapeFill(el, defs, images, warn)}"`
  let svg = ""
  if (o.tag === "rect") svg = `<rect x="${pt(x)}" y="${pt(y)}" width="${pt(w)}" height="${pt(h)}"${fill}${stroke}/>`
  else if (o.tag === "ellipse") svg = `<ellipse cx="${pt(x + w / 2)}" cy="${pt(y + h / 2)}" rx="${pt(w / 2)}" ry="${pt(h / 2)}"${fill}${stroke}/>`
  else if (o.tag === "line") {
    const s = findChildByLocalName(el, "startPt"), e = findChildByLocalName(el, "endPt")
    svg = `<line x1="${pt(x + num(s, "x") * sx)}" y1="${pt(y + num(s, "y") * sy)}" x2="${pt(x + num(e, "x") * sx)}" y2="${pt(y + num(e, "y") * sy)}" stroke="${color}" stroke-width="${(strokeW || 0.3).toFixed(2)}"${dash}${keepWidth}/>`
  } else if (o.tag === "polygon" || o.tag === "curv") {
    const pts = elements(el).filter(c => ln(c) === "pt").map(c => `${pt(x + num(c, "x") * sx)},${pt(y + num(c, "y") * sy)}`)
    if (pts.length >= 2) svg = `<polygon points="${pts.join(" ")}"${fill}${stroke}/>`
  } else if (o.tag === "curve") {
    // CURVE 조각도 점을 잇는다 — 한컴은 곡선을 촘촘한 점(약 200 HWPUNIT 간격)으로 펴서 조각마다 담는다(위례선 트램 보도자료 실측).
    // 종전엔 CURVE 조각이 하나라도 있으면 통째 생략해, 곡선 덮개가 가리던 자리가 드러났다(#116)
    const segs = elements(el).filter(c => ln(c) === "seg")
    if (segs.length) {
      let path = "", lastX: number | undefined, lastY: number | undefined
      for (const s of segs) {
        const x1 = num(s, "x1"), y1 = num(s, "y1"), x2 = num(s, "x2"), y2 = num(s, "y2")
        if (x1 !== lastX || y1 !== lastY) path += `M${pt(x + x1 * sx)} ${pt(y + y1 * sy)}`
        path += `L${pt(x + x2 * sx)} ${pt(y + y2 * sy)}`
        lastX = x2; lastY = y2
      }
      svg = `<path d="${path}"${fill}${stroke}/>`
    }
  } else if (o.tag === "arc") svg = `<ellipse cx="${pt(x + w / 2)}" cy="${pt(y + h / 2)}" rx="${pt(w / 2)}" ry="${pt(h / 2)}" fill="none"${stroke || ` stroke="${color}" stroke-width="0.3"`}/>`
  return { ...geometry, svg }
}
