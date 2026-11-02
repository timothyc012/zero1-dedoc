/**
 * HWP·HWPX 삽입 그림 속 글 OCR (#143) — `ocr: true`·`"force"`·OcrProvider 일 때만. 그림 블록(imageData) 바로 뒤에 그림에서 읽은
 * 문단·표 블록을 넣는다(PDF 그림 속 글과 같은 꼴). 기본(ocr 미지정)은 산출 불변 — HWP 글은 원문 그대로라 OCR 을 저절로 섞지 않는다.
 * 장식 그림(가로·세로 MIN_SIDE px 미만 — 글머리 기호·구분선)과 읽지 못하는 형식(WMF·EMF)은 건너뛴다. 단독 이미지 입력과 같은 경로
 * (parseImageDocument)라 OcrProvider 에도 그림 바이트를 그대로 넘긴다
 */

import type { IRBlock, ImageData, ParseOptions, ParseWarning } from "../types.js"
import { bmpToPng } from "../image/transcode.js"

/** 이보다 좁거나 낮은 그림은 글을 담지 않는 장식으로 본다 (px) */
const MIN_SIDE = 24

/** OCR 을 돌렸나 — 블록에 그림 속 글을 하나라도 넣었으면 true (호출부가 마크다운을 다시 만든다) */
export async function ocrEmbeddedImages(blocks: IRBlock[], options: ParseOptions | undefined, warnings: ParseWarning[]): Promise<boolean> {
  const ocr = options?.ocr
  if (ocr !== true && ocr !== "force" && typeof ocr !== "function") return false
  const { parseImageDocument } = await import("./image-ocr.js")
  let inserted = false, unreadable = 0
  let failed: string | null = null
  const walk = async (list: IRBlock[], depth: number): Promise<void> => {
    if (depth > 64) return
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      if (b.children) await walk(b.children, depth + 1)
      if (b.table) for (const row of b.table.cells) for (const cell of row) if (cell.blocks) await walk(cell.blocks, depth + 1)
      if (b.type !== "image" || !b.imageData || failed) continue
      const bytes = ocrBytes(b.imageData)
      if (!bytes) { unreadable++; continue }
      if (await tooSmall(bytes)) continue
      let found: IRBlock[]
      try {
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        found = (await parseImageDocument(buf, options)).blocks
      } catch (err) {
        // 모델·sharp 가 없으면 그림마다 같은 실패라 한 번만 알리고 멈춘다
        failed = err instanceof Error ? err.message : String(err)
        continue
      }
      if (!found.length) continue
      const placed = found.map(f => ({ ...f, pageNumber: b.pageNumber, bbox: undefined }))
      list.splice(i + 1, 0, ...placed)
      i += placed.length
      inserted = true
    }
  }
  await walk(blocks, 0)
  if (unreadable) warnings.push({ code: "SKIPPED_IMAGE", message: `${unreadable}개 그림은 OCR 로 읽을 수 없는 형식(WMF·EMF 등)이라 건너뜀` })
  if (failed) warnings.push({ code: "OCR_FAILED", message: `삽입 그림 OCR 실패 — 그림 속 글 없이 계속: ${failed}` })
  return inserted
}

/** OCR 엔진이 읽는 바이트 — BMP 는 PNG 로, 벡터 그림(WMF·EMF)은 null */
function ocrBytes(img: ImageData): Uint8Array | null {
  const mime = img.mimeType.toLowerCase()
  if (mime.includes("wmf") || mime.includes("emf")) return null
  if (mime.includes("bmp")) return bmpToPng(img.data)
  return img.data
}

/** 가로·세로 가운데 하나라도 MIN_SIDE 미만인가 — 크기를 못 읽으면 false(OCR 쪽에 맡긴다) */
async function tooSmall(bytes: Uint8Array): Promise<boolean> {
  try {
    const mod = (await import("sharp")) as unknown as { default?: unknown }
    const sharp = (typeof mod === "function" ? mod : mod.default) as (b: Buffer) => { metadata(): Promise<{ width?: number; height?: number }> }
    const { width, height } = await sharp(Buffer.from(bytes)).metadata()
    return !!width && !!height && (width < MIN_SIDE || height < MIN_SIDE)
  } catch {
    return false
  }
}
