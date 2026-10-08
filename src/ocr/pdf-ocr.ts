/**
 * PDF OCR 브릿지 — 대상 페이지를 pdfium 으로 래스터해 내장 엔진 또는
 * 사용자 OcrProvider 로 인식하고, 페이지별 IRBlock[] 을 돌려준다.
 *
 * - 내장 엔진: OcrItem 좌표를 PDF 포인트로 환산해 기존 블록 파이프라인
 *   (extractPageBlocksWithLines — xy-cut 읽기순서·클러스터 표 감지)에 태운다.
 *   스캔 문서도 표 구조 복원이 가능한 이유.
 * - 사용자 프로바이더: 페이지 PNG → 텍스트 → 페이지당 paragraph 블록 (종전 계약).
 *
 * 에러 계약 (v4.1.0 리뷰 F6/F7):
 * - 환경 오류(의존성·모델 미설치, PDF 오픈 실패)는 throw — 호출자가 NEEDS_OCR 폴백.
 * - 페이지 단위 실패는 본문 오염 대신 warnings(OCR_FAILED) 로 기록하고 계속.
 */

import type { IRBlock, OcrLine, OcrProvider, ParseWarning } from "../types.js"
import type { NormItem } from "../pdf/text-line.js"
import type { LineSegment } from "../pdf/line-types.js"
import { extractPageBlocksWithLines } from "../pdf/page-blocks.js"
import { detectRulingLines, rulingToPdfLines } from "./ruling-lines.js"
import { DEFAULT_OCR_TUNING, getOcrEngine, type OcrItem, type OcrPageStats, type OcrTuning } from "./engine.js"
import { normalizeOcrLanguage, type OcrLanguage } from "./models.js"
import { deskewPage } from "./deskew.js"
import { ensureOcrModels } from "./models.js"
import { OPTIONAL_DEP_INSTALL_HINT } from "../utils.js"
import { mergeOcrPasses } from "./detection-tiles.js"

/** OcrLine 좌표 자릿수 — 소수 둘째 자리 (0.01pt) */
const round2 = (v: number) => Math.round(v * 100) / 100

/** OCR 렌더 스케일 (72dpi × 3 = 216dpi) — 10pt 본문이 rec 입력 높이(48px)에 근접 */
const OCR_RENDER_SCALE = 3
/**
 * OCR 래스터 픽셀 상한 (쪽·이미지 공통) — 이보다 큰 쪽은 배율을 낮춰 이 안에 맞춘다. 쪽 크기를 가리지 않고 ×3 으로 그리면 628B PDF
 * (4000pt 정사각 쪽)가 12000² 래스터에 사본·괘선 마스크까지 2.38GB 를 먹었다(16000² PNG 1.84GB). A2(1191×1684pt)도 216dpi 로 18MP 라
 * 공문서 판형은 줄지 않는다
 */
export const MAX_OCR_PIXELS = 24_000_000
/** 페이지 협력 취소 예산 — 진행 중 native 작업은 종료까지 기다리므로 hard deadline 은 아니다 */
const PAGE_TIMEOUT_MS = 120_000

export function isCloserReadUseful(
  regions: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  pageWidth: number,
  pageHeight: number,
): boolean {
  const pageArea = Math.max(1, pageWidth * pageHeight)
  return regions.some(r => Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1) < pageArea * 0.8)
}

export type OcrMode = "builtin" | OcrProvider

/** pdfjs 연산자 목록 (그래픽만 쓴다 — 괘선·채움·그림 영역) */
export type PageOps = { fnArray: Uint32Array | number[]; argsArray: unknown[][] }

/**
 * 대상 페이지들을 OCR 해 페이지별 블록 맵 반환.
 * @param buffer 원본 PDF (pdfjs 가 detach 하기 전에 clone 해 둔 것)
 * @param targets 1-based 페이지 번호 집합
 * @param vectorOps 벡터 글자 쪽(글자를 곡선으로 그린 쪽)의 그래픽(vector-glyphs.ts ocrVectorOps) — 그 쪽은 표 구조를
 *   래스터 괘선 감지 대신 이것(실제 괘선)으로 복원한다. 스캔 쪽은 벡터가 없으니 없다
 */
export async function runPdfOcr(
  buffer: ArrayBuffer,
  targets: Set<number>,
  mode: OcrMode,
  warnings: ParseWarning[],
  onProgress?: (current: number, total: number) => void,
  detectTables = true,
  vectorOps?: Map<number, PageOps>,
  imageRegions?: Map<number, Array<{ x1: number; y1: number; x2: number; y2: number }>>,
  ocrLanguage?: string,
  /** 넘기면 내장 엔진이 읽은 줄을 여기에 모은다 (ParseOptions.ocrLines) — 끝까지 성공한 쪽만 */
  lines?: OcrLine[],
): Promise<Map<number, IRBlock[]>> {
  const result = new Map<number, IRBlock[]>()
  if (targets.size === 0) return result

  // 환경 준비 — 실패는 그대로 throw (호출자가 NEEDS_OCR 폴백)
  const pdfiumMod = await tryImport<typeof import("@hyzyla/pdfium")>(
    "@hyzyla/pdfium",
    () => import("@hyzyla/pdfium"),
  )
  const language: OcrLanguage = normalizeOcrLanguage(ocrLanguage)
  if (mode === "builtin") {
    await ensureOcrModels(p => {
      if (p.phase === "download" && p.downloaded === 0) {
        process.stderr.write(`[kordoc-ocr] ${p.spec.name} 다운로드 중 (~${p.spec.sizeMb}MB)...\n`)
      }
    }, language)
  }
  const engine = mode === "builtin" ? await getOcrEngine(language) : null

  const pdfium = await pdfiumMod.PDFiumLibrary.init()
  try {
    const doc = await pdfium.loadDocument(new Uint8Array(buffer))
    try {
      let done = 0
      // 대상 쪽만 연다 — doc.pages() 는 모든 쪽을 불러오고, 쪽은 render() 가 끝에서만 닫아 대상 밖 쪽이 문서를 닫을 때까지 남았다
      // (changwon 328쪽 문서의 한 쪽 OCR: 6ms·26MB → 전 쪽 순회 970ms·330MB). pdfium 쪽 번호는 0-based — 대외 계약(1-based)으로 환산
      const count = doc.getPageCount()
      for (const pageNo of [...targets].filter(p => p >= 1 && p <= count).sort((a, b) => a - b)) {
        onProgress?.(++done, targets.size)
        try {
          const page = doc.getPage(pageNo - 1)
          // 결과·줄·경고는 성공한 쪽만 커밋한다. 취소된 작업의 늦은 진단은 공유 배열에 닿지 않는다.
          const pageWarnings: ParseWarning[] = []
          const read = await withTimeout(
            signal => ocrOnePage(page, pageNo, mode, engine, pageWarnings, detectTables, vectorOps?.get(pageNo), imageRegions?.get(pageNo), signal),
            PAGE_TIMEOUT_MS,
            `OCR 페이지 ${pageNo} 타임아웃 (${PAGE_TIMEOUT_MS / 1000}초)`,
          )
          // 빈 인식은 검증된 백지가 아니다 — 기존 텍스트를 지울 성공 항목으로 넘기지 않는다.
          if (read.blocks.length === 0) throw new Error(`페이지 ${pageNo} OCR 결과 없음`)
          result.set(pageNo, read.blocks)
          lines?.push(...read.lines)
          warnings.push(...pageWarnings)
        } catch (e) {
          warnings.push({
            page: pageNo,
            message: `페이지 ${pageNo} OCR 실패: ${e instanceof Error ? e.message : String(e)}`,
            code: "OCR_FAILED",
          })
        }
      }
    } finally {
      doc.destroy()
    }
  } finally {
    pdfium.destroy()
  }
  return result
}

async function ocrOnePage(
  page: import("@hyzyla/pdfium").PDFiumPage,
  pageNo: number,
  mode: OcrMode,
  engine: Awaited<ReturnType<typeof getOcrEngine>> | null,
  warnings: ParseWarning[],
  detectTables: boolean,
  vectorOps?: PageOps,
  regions?: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  signal?: AbortSignal,
): Promise<{ blocks: IRBlock[]; lines: OcrLine[] }> {
  signal?.throwIfAborted()
  const { originalWidth: pdfW, originalHeight: pdfH } = page.getOriginalSize()
  const renderScale = Math.min(OCR_RENDER_SCALE, Math.sqrt(MAX_OCR_PIXELS / Math.max(1, pdfW * pdfH)))
  if (renderScale < OCR_RENDER_SCALE) {
    warnings.push({ page: pageNo, code: "PARTIAL_PARSE", message: `OCR 래스터 픽셀 상한으로 렌더 해상도를 축소했습니다 (작은 글자 인식 결손 가능)` })
  }
  // 그림 영역만 읽는 쪽은 두 배로 한 번 그려 영역 다시 읽기(closer)에 쓰고, 쪽 배율 래스터는 2×2 평균으로 줄여 만든다
  // (pdfium 은 같은 쪽을 두 번 그리면 wasm 서명 오류가 난다)
  const closer = regions && mode === "builtin" && isCloserReadUseful(regions, pdfW, pdfH) &&
    renderScale * 2 <= Math.sqrt(MAX_OCR_PIXELS / Math.max(1, pdfW * pdfH))
  const rendered = await page.render({
    scale: closer ? renderScale * 2 : renderScale,
    render: async ({ data }) => data,
  })
  signal?.throwIfAborted()
  const hiRgba = closer ? bgraToRgba(rendered.data) : null
  const { rgba, width: rw, height: rh } = hiRgba
    ? halve(hiRgba, rendered.width, rendered.height)
    : { rgba: bgraToRgba(rendered.data), width: rendered.width, height: rendered.height }

  if (mode === "builtin") {
    // 스캔 기울기 보정 — 인식과 괘선 감지가 같은(바로 선) 래스터를 본다. 클린 렌더는 무보정.
    // 벡터 글자 쪽은 보정하지 않는다 — 글자 좌표가 돌면 그 쪽 벡터 괘선과 어긋난다
    const { rgba: upright, angle: deskewAngle } = vectorOps ? { rgba, angle: 0 } : deskewPage(rgba, rw, rh)
    const stats: OcrPageStats = { droppedLowConf: 0 }
    const ruling = vectorOps ? undefined : detectRulingLines(upright, rw, rh, rh / pdfH)
    const items = await engine!.recognizePage(upright, rw, rh, stats, regions ? REGION_TUNING : undefined, ruling?.cellDividers, signal)
    signal?.throwIfAborted()
    if (stats.droppedLowConf > 0) {
      warnings.push({
        page: pageNo,
        message: `페이지 ${pageNo}: 저신뢰 OCR 라인 ${stats.droppedLowConf}개 폐기 (인식 결손 가능)`,
        code: "OCR_LOW_CONF",
      })
    }
    if (stats.truncatedBoxes) {
      warnings.push({ page: pageNo, message: `페이지 ${pageNo}: OCR 검출 상자가 너무 많아 ${stats.truncatedBoxes}개는 인식하지 않음 (일부 글 결손)`, code: "PARTIAL_PARSE" })
    }
    const scale = rh / pdfH
    // 텍스트층이 있는 쪽의 그림 영역만 읽을 때는 영역마다 그 안 글줄로 따로 블록을 만든다 — 쪽 전체로 묶으면 본문 줄과 그림 글이
    // 한 문단으로 합쳐져 영역 판정(mergeOcrImageRegions)에서 빠진다
    if (regions) {
      const inside = (it: OcrItem, r: { x1: number; y1: number; x2: number; y2: number }) => {
        const cx = (it.x + it.w / 2) / scale, cy = pdfH - (it.y + it.h / 2) / scale
        return cx >= r.x1 && cx <= r.x2 && cy >= r.y1 && cy <= r.y2
      }
      const reads = hiRgba ? await closerReads(hiRgba, rw * 2, rh * 2, pdfW, pdfH, scale * 2, regions, engine!, signal) : []
      const lines: OcrLine[] = []
      const blocks = regions.flatMap((r, k) => {
        let own = items.filter(it => inside(it, r))
        // 그림 속 글은 작다(차트 눈금·범례 6~8pt) — 영역만 두 배로 다시 읽고
        // 겹치는 줄마다 더 많은 글자를 보존한 후보를 합친다. 페이지 전체 평균 신뢰도는
        // 큰 표제 몇 줄이 점수를 끌어올려 작은 가격·각주를 통째로 버릴 수 있다.
        const near = reads[k]
        if (near?.length) own = mergeOcrPasses(own, near)
        lines.push(...ocrItemsToLines(own, pageNo, pdfH, scale, deskewAngle, rw, rh))
        return own.length ? ocrItemsToBlocks(own, pageNo, pdfW, pdfH, scale, ruling && rulingToPdfLines(ruling, scale, pdfH), detectTables) : []
      })
      return { blocks, lines }
    }
    const lines = ocrItemsToLines(items, pageNo, pdfH, scale, deskewAngle, rw, rh)
    // 벡터 글자 쪽: 표 구조는 그 쪽의 실제 괘선으로 (rhwp cairo 13쌍 46표 exact: 래스터 괘선 14 → 실제 괘선 20)
    if (vectorOps) return { blocks: ocrItemsToBlocks(items, pageNo, pdfW, pdfH, scale, undefined, detectTables, vectorOps), lines }
    // 래스터에서 표 괘선 감지 — 스캔본 병합셀 서식도 선 기반 표 파이프라인을 탄다
    const extraLines = rulingToPdfLines(ruling!, scale, pdfH)
    return { blocks: ocrItemsToBlocks(items, pageNo, pdfW, pdfH, scale, extraLines, detectTables), lines }
  }

  // 사용자 프로바이더 — PNG 인코딩 후 호출, 페이지당 paragraph (종전 계약)
  type SharpPngFactory = (
    input: Uint8Array,
    opts: { raw: { width: number; height: number; channels: number } },
  ) => { png(): { toBuffer(): Promise<Buffer> } }
  const sharpModRaw = await tryImport<{ default?: SharpPngFactory } & SharpPngFactory>(
    "sharp",
    () => import("sharp") as unknown as Promise<{ default?: SharpPngFactory } & SharpPngFactory>,
  )
  signal?.throwIfAborted()
  const sharpAny = sharpModRaw as { default?: SharpPngFactory } | SharpPngFactory
  const sharp: SharpPngFactory =
    typeof sharpAny === "function" ? sharpAny : (sharpAny.default ?? (sharpAny as unknown as SharpPngFactory))
  const png = await sharp(rgba, { raw: { width: rw, height: rh, channels: 4 } })
    .png()
    .toBuffer()
  signal?.throwIfAborted()

  // OcrProvider 의 기존 3인자 계약에는 취소 신호가 없다. 완료까지 기다린 뒤 늦은 결과를 버린다.
  const text = await mode(new Uint8Array(png), pageNo, "image/png")
  signal?.throwIfAborted()
  if (!text.trim()) throw new Error(`페이지 ${pageNo} OCR 결과 없음`)
  // 사용자 프로바이더는 줄 좌표를 주지 않는다 — ocrLines 없음
  return { blocks: [{ type: "paragraph", text: text.trim(), pageNumber: pageNo }], lines: [] }
}

/**
 * OcrItem(바로 세운 래스터 px, 왼쪽 위 원점) → OcrLine(pdfium 이 그린 방향의 쪽 PDF pt, 왼쪽 아래 원점) — ParseOptions.ocrLines.
 * 회전 전 사용자 좌표로는 파서가 ocrLineToUserSpace 로 옮긴다.
 * deskewAngle 은 deskewPage 가 쪽을 돌린 각(도, 화면상 반시계)이다. 줄 중심을 rotateRgba 와 같은 역변환으로 원래 래스터
 * 자리에 되돌리고, 폭·높이는 바로 선 줄 그대로 둔다 — 원래 스캔의 줄은 그 상자를 중심 기준 −deskewAngle 만큼 돌린 것
 * (텍스트층 쪽의 그림 영역은 보통 클린 렌더라 보정이 걸리지 않는다. 걸리면 두 배로 다시 읽은 줄(closerReads — 보정 전 래스터)의
 * 자리는 조금 어긋날 수 있다)
 */
export function ocrItemsToLines(
  items: OcrItem[], page: number, pdfH: number, scale: number, deskewAngle: number, rasterW: number, rasterH: number,
): OcrLine[] {
  const t = (deskewAngle * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t)
  const cx = (rasterW - 1) / 2, cy = (rasterH - 1) / 2
  return items.filter(it => it.text.trim()).map(it => {
    const dx = it.x + it.w / 2 - cx, dy = it.y + it.h / 2 - cy
    const ox = c * dx - s * dy + cx, oy = s * dx + c * dy + cy
    const width = it.w / scale, height = it.h / scale
    return {
      text: it.text,
      bbox: { page, x: round2(ox / scale - width / 2), y: round2(pdfH - oy / scale - height / 2), width: round2(width), height: round2(height) },
      angle: deskewAngle ? -deskewAngle : 0,
      confidence: it.confidence,
    }
  })
}

/**
 * OcrLine 을 pdfium 이 그린 방향(/Rotate 적용)에서 회전 전 사용자 좌표로 — PDFKit 쪽 좌표·본문 글 bbox 와 같은 기준.
 * view 는 pdfjs page.view(CropBox [x1, y1, x2, y2]), rotate 는 /Rotate(시계 방향 0·90·180·270). 상자는 중심만 옮기고 폭·높이는 줄 기준
 * 그대로 둔다. 쪽을 시계로 돌려 보여 주는 만큼 회전 전 쪽의 글은 반시계로 누워 있으므로 angle 에 회전을 더한다
 */
export function ocrLineToUserSpace(line: OcrLine, view: number[], rotate: number): OcrLine {
  const [x1, y1, x2, y2] = view, W = x2 - x1, H = y2 - y1
  const r = ((rotate % 360) + 360) % 360
  const { bbox } = line, xd = bbox.x + bbox.width / 2, yd = bbox.y + bbox.height / 2
  const [u, v] = r === 90 ? [W - yd, xd] : r === 180 ? [W - xd, H - yd] : r === 270 ? [yd, H - xd] : [xd, yd]
  const angle = line.angle + r > 180 ? line.angle + r - 360 : line.angle + r
  return { ...line, bbox: { ...bbox, x: round2(x1 + u - bbox.width / 2), y: round2(y1 + v - bbox.height / 2) }, angle }
}

/** 2×2 평균 축소 (RGBA) */
function halve(src: Uint8Array, w: number, h: number): { rgba: Uint8Array; width: number; height: number } {
  const W = w >> 1, H = h >> 1
  const out = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = ((2 * y) * w + 2 * x) * 4, b = a + w * 4, o = (y * W + x) * 4
    for (let c = 0; c < 4; c++) out[o + c] = (src[a + c] + src[a + 4 + c] + src[b + c] + src[b + 4 + c] + 2) >> 2
  }
  return { rgba: out, width: W, height: H }
}

/** 그림 영역만 읽을 때 — 끝자락 지우기를 끈다 (engine OcrTuning.trimEdges 주석) */
const REGION_TUNING: Readonly<OcrTuning> = Object.freeze({ ...DEFAULT_OCR_TUNING, trimEdges: false })

/** 그림 영역마다 두 배 래스터에서 잘라 다시 인식한 글줄 — 좌표는 쪽 배율 래스터 기준으로 되돌린다 */
async function closerReads(
  rgba: Uint8Array, rw: number, rh: number, pdfW: number, pdfH: number, hi: number,
  regions: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  engine: NonNullable<Awaited<ReturnType<typeof getOcrEngine>>>,
  signal?: AbortSignal,
): Promise<Array<OcrItem[] | null>> {
  const out: Array<OcrItem[] | null> = []
  for (const r of regions) {
    signal?.throwIfAborted()
    const regionArea = Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1)
    if (regionArea >= pdfW * pdfH * 0.8) { out.push(null); continue }
    const x0 = Math.max(0, Math.floor(r.x1 * hi)), y0 = Math.max(0, Math.floor((pdfH - r.y2) * hi))
    const cw = Math.min(rw, Math.ceil(r.x2 * hi)) - x0, ch = Math.min(rh, Math.ceil((pdfH - r.y1) * hi)) - y0
    if (cw < 16 || ch < 16) { out.push(null); continue }
    const crop = new Uint8Array(cw * ch * 4)
    for (let y = 0; y < ch; y++) crop.set(rgba.subarray(((y0 + y) * rw + x0) * 4, ((y0 + y) * rw + x0 + cw) * 4), y * cw * 4)
    const items = await engine.recognizePage(crop, cw, ch, undefined, REGION_TUNING, undefined, signal)
    signal?.throwIfAborted()
    out.push(items.map(it => ({ ...it, x: (it.x + x0) / 2, y: (it.y + y0) / 2, w: it.w / 2, h: it.h / 2 })))
  }
  return out
}

/**
 * OcrItem(렌더 픽셀, top-left origin) → NormItem(PDF pt, bottom-up baseline)
 * 으로 환산해 기존 블록 파이프라인에 태운다. 괘선은 래스터 감지 결과(extraLines)로
 * 공급 — 없으면 클러스터 감지기 몫이다. 벡터 글자 쪽은 그 쪽 그래픽 연산자 목록(opList)을
 * 넘겨 실제 괘선을 쓴다.
 * (이미지 직접 입력 경로 image-ocr.ts 와 공유)
 */
export function ocrItemsToBlocks(
  items: OcrItem[],
  pageNumber: number,
  pdfW: number,
  pdfH: number,
  scale: number,
  extraLines?: { horizontals: LineSegment[]; verticals: LineSegment[] },
  detectTables = true,
  opList: PageOps = { fnArray: [], argsArray: [] },
): IRBlock[] {
  const norm: NormItem[] = items.map(it => {
    const h = it.h / scale
    return {
      text: it.text,
      x: Math.round(it.x / scale),
      // NormItem.y 는 pdfjs transform[5] = 베이스라인 (bottom-up) — 잉크 하단으로 근사
      y: Math.round(pdfH - (it.y + it.h) / scale),
      w: Math.round(it.w / scale),
      h: Math.round(h),
      // 박스는 잉크 외곽(engine tightBoxes) — 한글 줄 잉크 높이 ≈ 0.9em
      fontSize: Math.max(1, Math.round(h / 0.9)),
      fontName: "ocr",
      isHidden: false,
    }
  })
  return extractPageBlocksWithLines(norm, pageNumber, opList, pdfW, pdfH, extraLines, detectTables)
}

async function tryImport<T>(name: string, loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (e) {
    throw new Error(
      `OCR 을 사용하려면 optional dependency '${name}' 이 필요합니다. ` +
        `\`npm install ${name}\` 후 다시 실행하세요.${OPTIONAL_DEP_INSTALL_HINT} 원인: ${(e as Error).message}`,
    )
  }
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number, msg: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(msg)), ms)
  try {
    // Promise.race 는 PDFium/ONNX/프로바이더를 취소하지 않는다. 진행 중 호출을 반드시 drain 해야
    // 다음 쪽과 겹치지 않고, 사용 중인 문서·라이브러리가 파괴되지 않는다. hard deadline 은 worker 격리가 필요하다.
    const value = await operation(controller.signal)
    controller.signal.throwIfAborted()
    return value
  } catch (error) {
    controller.signal.throwIfAborted() // 늦은 실패도 원래 타임아웃으로 보고
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** pdfium BGRA → RGBA */
function bgraToRgba(bgra: Uint8Array): Uint8Array {
  const out = new Uint8Array(bgra.length)
  for (let i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2]
    out[i + 1] = bgra[i + 1]
    out[i + 2] = bgra[i]
    out[i + 3] = bgra[i + 3]
  }
  return out
}
