/** Narrow parsing entry point: load only the detected format implementation. */
import { readFile } from "fs/promises"
import { stripScriptTags } from "./script-tags.js"
import { toPlainMarkdown } from "./plain-markdown.js"
import { toHtmlTables } from "./html-tables.js"
import { detectFormat, detectOle2Format, detectZipFormat } from "./detect.js"
import type { ParseResult, ParseSuccess, ParseOptions, IRBlock } from "./types.js"
import { classifyError, sanitizeError, toArrayBuffer } from "./utils.js"
import { blocksToMarkdown } from "./table/builder.js"
import { classifyTableTree } from "./table/analyze.js"
import { blocksToPages } from "./page-markdown.js"

// ─── 메인 API ────────────────────────────────────────

/**
 * 파일 버퍼를 자동 감지하여 Markdown으로 변환
 *
 * @example
 * ```ts
 * import { parse } from "kordoc"
 * // 파일 경로로 파싱
 * const result = await parse("document.hwp")
 * // 또는 Buffer로 파싱
 * const result = await parse(buffer)
 * ```
 */
export async function parse(input: string | ArrayBuffer | Buffer, options?: ParseOptions): Promise<ParseResult> {
  let buffer: ArrayBuffer
  // 파일 경로 입력 시 filePath를 options에 자동 설정 (DRM COM fallback에 필요)
  const opts = typeof input === "string" && !options?.filePath
    ? { ...options, filePath: input }
    : options
  if (typeof input === "string") {
    try {
      const buf = await readFile(input)
      buffer = toArrayBuffer(buf)
    } catch (err) {
      const msg = err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `파일을 찾을 수 없습니다: ${input}`
        : `파일 읽기 실패: ${input}`
      return { success: false, fileType: "unknown", error: msg, code: "PARSE_ERROR" }
    }
  } else if (Buffer.isBuffer(input)) {
    buffer = toArrayBuffer(input)
  } else {
    buffer = input
  }

  if (!buffer || buffer.byteLength === 0) {
    return { success: false, fileType: "unknown", error: "빈 버퍼이거나 유효하지 않은 입력입니다.", code: "EMPTY_INPUT" }
  }
  const format = detectFormat(buffer)

  const result = await dispatch(format, buffer, opts)
  // images:false: 포맷별 파서가 풀어 둔 이미지 바이트를 결과에서 뗀다 (PDF 는 파서가 PNG 인코딩부터 건너뜀)
  if (result.success && opts?.images === false) {
    delete result.images
    dropImageBytes(result.blocks)
  }
  // opt-in 표 분류(#76) — 구조 파싱 뒤 메타만 붙인다. 기본(미지정/false)은 산출 불변
  if (result.success && opts?.classifyTables) classifyTableTree(result.blocks)
  // 페이지별 마크다운(#68)은 파서가 채운 pageNumber 의 사영이라 여기서 한 번에
  // 붙인다. 포맷별 파서를 직접 부르는 호출자는 `blocksToPages(result.blocks)` 로
  // 같은 값을 얻는다.
  let out = result
  if (result.success && !result.pages) {
    const pages = blocksToPages(result.blocks)
    if (pages) out = { ...result, pages }
  }
  // plain: 그림 자리 표시·링크 URL·밑줄/굵게 표기를 걷은 글 위주 Markdown (블록 IR 은 그대로)
  if (out.success && opts?.plain) {
    out = { ...out, markdown: toPlainMarkdown(out.markdown), ...(out.pages ? { pages: out.pages.map(p => ({ ...p, markdown: toPlainMarkdown(p.markdown) })) } : {}) }
  }
  // htmlTables: 모든 표를 태그마다 한 줄씩 들여쓴 HTML 로 (파이프 표 포함)
  if (out.success && opts?.htmlTables) {
    out = { ...out, markdown: toHtmlTables(out.markdown), ...(out.pages ? { pages: out.pages.map(p => ({ ...p, markdown: toHtmlTables(p.markdown) })) } : {}) }
  }
  return out
}

/** 블록 트리(자식·표 셀·캡션)에서 이미지 바이트(imageData)를 뗀다. 그림 자리 표시 블록은 남긴다 */
function dropImageBytes(blocks: IRBlock[] | undefined, depth = 0): void {
  if (!blocks || depth > 64) return
  for (const b of blocks) {
    if (b.imageData) delete b.imageData
    dropImageBytes(b.children, depth + 1)
    if (b.table) {
      for (const row of b.table.cells) for (const cell of row) dropImageBytes(cell.blocks, depth + 1)
      dropImageBytes(b.table.captionBlocks, depth + 1)
    }
  }
}

async function dispatch(
  format: ReturnType<typeof detectFormat>,
  buffer: ArrayBuffer,
  opts: ParseOptions | undefined,
): Promise<ParseResult> {
  switch (format) {
    case "hwpx": {
      // ZIP 기반 포맷 세분화: HWPX, XLSX, DOCX, PPTX 구분
      const zipFormat = await detectZipFormat(buffer)
      if (zipFormat === "xlsx") return parseXlsx(buffer, opts)
      if (zipFormat === "docx") return parseDocx(buffer, opts)
      if (zipFormat === "pptx") return parsePptx(buffer, opts)
      // unknown은 손상 ZIP·비표준 섹션 경로의 HWPX 복구를 위해 기존 파서로 전달
      return parseHwpx(buffer, opts)
    }
    case "hwp": {
      // OLE2 기반 포맷 세분화: HWP 5.x vs XLS (Excel 97-2003)
      const ole2Format = detectOle2Format(buffer)
      if (ole2Format === "xls") return parseXls(buffer, opts)
      return parseHwp(buffer, opts)
    }
    case "hwp3":
      return parseHwp3(buffer, opts)
    case "hwpml":
      return parseHwpml(buffer, opts)
    case "pdf":
      return parsePdf(buffer, opts)
    case "image":
      return parseImage(buffer, opts)
    default:
      return { success: false, fileType: "unknown", error: "지원하지 않는 파일 형식입니다.", code: "UNSUPPORTED_FORMAT" }
  }
}

/** 첨자 표기 끔 — 태그만 걷는다(ParseOptions.scriptTags) */
function scriptsOff(r: ParseSuccess, off: boolean): ParseSuccess {
  return off ? stripScriptTags(r) : r
}

/** 이미지(PNG/JPEG/WebP)를 OCR 로 Markdown 변환 — 텍스트층이 없으므로 OCR 상시 적용 */
export async function parseImage(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseImageDocument } = await import("./ocr/image-ocr.js")
    const { blocks, warnings } = await parseImageDocument(buffer, options)
    // OCR 글은 첨자를 가르지 않는다(검출 박스로는 기준선을 믿을 수 없다) — scriptTags 와 무관하게 평문
    stripScriptTags({ blocks })
    return {
      success: true,
      fileType: "image",
      markdown: blocksToMarkdown(blocks),
      blocks,
      warnings: warnings.length ? warnings : undefined,
      pageCount: 1,
    }
  } catch (err) {
    return { success: false, fileType: "image", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** HWP 3.x (구버전 한컴 워드프로세서) 파일을 Markdown 으로 변환. */
export async function parseHwp3(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseHwp3Document } = await import("./hwp3/parser.js")
    const { markdown, blocks, metadata, outline, warnings } = parseHwp3Document(buffer, options)
    return { success: true, fileType: "hwp3", markdown, blocks, metadata, outline, warnings, pageCount: metadata?.pageCount }
  } catch (err) {
    // 에러 메시지 정제 — KordocError만 그대로, 내부 에러는 일반화 (MCP 노출 일관성)
    return { success: false, fileType: "hwp3", error: sanitizeError(err), code: classifyError(err) }
  }
}

// ─── 포맷별 API ──────────────────────────────────────

/** HWPX 파일을 Markdown으로 변환 */
export async function parseHwpx(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseHwpxDocument } = await import("./hwpx/parser.js")
    const { markdown, blocks, metadata, outline, warnings, images } = await parseHwpxDocument(buffer, options)
    return scriptsOff({ success: true, fileType: "hwpx", markdown, blocks, metadata, outline, warnings, images: images?.length ? images : undefined, pageCount: metadata?.pageCount }, options?.scriptTags === false)
  } catch (err) {
    return { success: false, fileType: "hwpx", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** HWP 5.x 바이너리 파일을 Markdown으로 변환 */
export async function parseHwp(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseHwp5Document } = await import("./hwp5/parser.js")
    const { isDistributionSentinel } = await import("./hwp5/sentinel.js")
    const { isComFallbackAvailable, extractTextViaCom, comResultToParseResult } = await import("./hwpx/com-fallback.js")
    const { markdown, blocks, metadata, outline, warnings, images } = parseHwp5Document(Buffer.from(buffer), options)

    // 배포용 HWP 5.x 감지 — 본문이 "상위 버전의 배포용 문서입니다..." 플레이스홀더뿐이면
    // COM fallback으로 재시도 (Windows + 한컴오피스 환경에서만). 이슈 #25 대응.
    if (isDistributionSentinel(markdown) && isComFallbackAvailable() && options?.filePath) {
      try {
        const { pages, pageCount, warnings: comWarns } = extractTextViaCom(options.filePath)
        if (pages.some(p => p && p.trim().length > 0)) {
          const com = comResultToParseResult(pages, pageCount, comWarns)
          return {
            success: true,
            fileType: "hwp",
            markdown: com.markdown,
            blocks: com.blocks,
            metadata: com.metadata,
            warnings: com.warnings,
            pageCount,
          }
        }
      } catch {
        // COM 실패 시 기존 결과(경고 문자열 포함) 그대로 반환
      }
    }

    return scriptsOff({ success: true, fileType: "hwp", markdown, blocks, metadata, outline, warnings, images: images?.length ? images : undefined, pageCount: metadata?.pageCount }, options?.scriptTags === false)
  } catch (err) {
    return { success: false, fileType: "hwp", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** PDF 파일에서 텍스트를 추출하여 Markdown으로 변환 */
export async function parsePdf(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  let parsePdfDocument: typeof import("./pdf/parser.js").parsePdfDocument
  try {
    const mod = await import("./pdf/parser.js")
    parsePdfDocument = mod.parsePdfDocument
  } catch {
    return {
      success: false, fileType: "pdf",
      error: "PDF 파싱에 pdfjs-dist가 필요합니다. 설치: npm install pdfjs-dist",
      code: "MISSING_DEPENDENCY",
    }
  }
  try {
    const { markdown, blocks, metadata, outline, warnings, isImageBased, pageQuality, qualitySummary, images, pages, ocrLines } = await parsePdfDocument(buffer, options)
    // 첨자 표기 — PDF 는 기하 추정이라 기본 끔(scriptTags: true 로 켠다)
    return scriptsOff({ success: true, fileType: "pdf", markdown, blocks, metadata, outline, warnings, isImageBased, pageQuality, qualitySummary, images, pages, pageCount: metadata?.pageCount, ...(ocrLines?.length ? { ocrLines } : {}) }, options?.scriptTags !== true)
  } catch (err) {
    const isImageBased = err instanceof Error && "isImageBased" in err ? true : undefined
    return { success: false, fileType: "pdf", error: sanitizeError(err), code: classifyError(err), isImageBased }
  }
}

/** XLSX 파일을 Markdown으로 변환 */
export async function parseXlsx(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseXlsxDocument } = await import("./xlsx/parser.js")
    const { markdown, blocks, metadata, warnings } = await parseXlsxDocument(buffer, options)
    return { success: true, fileType: "xlsx", markdown, blocks, metadata, warnings, pageCount: metadata?.pageCount }
  } catch (err) {
    return { success: false, fileType: "xlsx", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** XLS (Excel 97-2003) 파일을 Markdown으로 변환 */
export async function parseXls(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseXlsDocument } = await import("./xls/parser.js")
    const { markdown, blocks, metadata, warnings } = await parseXlsDocument(buffer, options)
    return { success: true, fileType: "xls", markdown, blocks, metadata, warnings, pageCount: metadata?.pageCount }
  } catch (err) {
    return { success: false, fileType: "xls", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** DOCX 파일을 Markdown으로 변환 */
export async function parseDocx(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseDocxDocument } = await import("./docx/parser.js")
    const { markdown, blocks, metadata, outline, warnings, images } = await parseDocxDocument(buffer, options)
    return scriptsOff({ success: true, fileType: "docx", markdown, blocks, metadata, outline, warnings, images: images?.length ? images : undefined, pageCount: metadata?.pageCount }, options?.scriptTags === false)
  } catch (err) {
    return { success: false, fileType: "docx", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** PPTX 파일을 슬라이드 순서에 따라 Markdown으로 변환 */
export async function parsePptx(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parsePptxDocument } = await import("./pptx/parser.js")
    const { markdown, blocks, metadata, warnings } = await parsePptxDocument(buffer, options)
    return { success: true, fileType: "pptx", markdown, blocks, metadata, warnings, pageCount: metadata?.pageCount }
  } catch (err) {
    return { success: false, fileType: "pptx", error: sanitizeError(err), code: classifyError(err) }
  }
}

/** HWPML (XML 기반 한컴 문서) 파일을 Markdown으로 변환 */
export async function parseHwpml(buffer: ArrayBuffer, options?: ParseOptions): Promise<ParseResult> {
  try {
    const { parseHwpmlDocument } = await import("./hwpml/parser.js")
    const { markdown, blocks, metadata, outline, warnings } = parseHwpmlDocument(buffer, options)
    return { success: true, fileType: "hwpml", markdown, blocks, metadata, outline, warnings, pageCount: metadata?.pageCount }
  } catch (err) {
    return { success: false, fileType: "hwpml", error: sanitizeError(err), code: classifyError(err) }
  }
}
