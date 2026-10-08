/**
 * kordoc — 모두 파싱해버리겠다
 *
 * HWP, HWPX, PDF → Markdown 변환 통합 라이브러리
 */

import { readFile } from "fs/promises"
import { detectFormat, detectZipFormat } from "./detect.js"
import { parse } from "./parse.js"
import { toArrayBuffer } from "./utils.js"
import { fillFormFields } from "./form/filler.js"
import type { FillResult } from "./form/filler.js"
import type { FillValue, FillInput } from "./form/match.js"
import { fillHwpx } from "./form/filler-hwpx.js"
import type { HwpxFillResult } from "./form/filler-hwpx.js"
import { blocksToMarkdown } from "./table/builder.js"
import { markdownToHwpx } from "./hwpx/generator.js"

// ─── 메인 API ────────────────────────────────────────

export {
  parse, parseImage, parseHwp3, parseHwpx, parseHwp, parsePdf,
  parseXlsx, parseXls, parseDocx, parsePptx, parseHwpml,
} from "./parse.js"

// ─── 서식 채우기 API ────────────────────────────────

/**
 * 서식 채우기 출력 포맷
 * - "markdown": 마크다운 텍스트
 * - "hwpx": 새로 생성한 HWPX (스타일 초기화)
 * - "hwpx-preserve": 원본 HWPX ZIP 직접 수정 (스타일 100% 보존, HWPX 입력만 가능)
 */
export type FillOutputFormat = "markdown" | "hwpx" | "hwpx-preserve"

/** 서식 채우기 결과 */
export interface FillFormOutput {
  /** 채워진 문서 (markdown: string, hwpx/hwpx-preserve: ArrayBuffer) */
  output: string | ArrayBuffer
  /** 출력 포맷 */
  format: FillOutputFormat
  /** 채우기 상세 — filled 필드 목록 + unmatched 라벨 */
  fill: { filled: import("./types.js").FormField[]; unmatched: string[] }
}

/**
 * 서식 문서를 파싱하여 필드를 채우고, 원하는 포맷으로 출력.
 *
 * - "hwpx-preserve": HWPX 입력 → 원본 ZIP XML 직접 수정 (테두리/폰트/병합 등 100% 보존)
 * - "hwpx": 아무 포맷 → IRBlock → Markdown → HWPX 생성 (스타일 초기화됨)
 * - "markdown": 아무 포맷 → IRBlock → Markdown
 *
 * @example
 * ```ts
 * // HWPX 원본 스타일 보존 채우기
 * const result = await fillForm("신청서.hwpx", { "성명": "홍길동" }, "hwpx-preserve")
 * writeFileSync("결과.hwpx", Buffer.from(result.output as ArrayBuffer))
 *
 * // 아무 포맷 → 마크다운 채우기
 * const result = await fillForm("신청서.hwp", { "성명": "홍길동" })
 * console.log(result.output)  // 채워진 마크다운
 * ```
 */
export async function fillForm(
  input: string | ArrayBuffer | Buffer,
  values: Record<string, FillInput>,
  outputFormat: FillOutputFormat = "markdown",
): Promise<FillFormOutput> {
  // 입력 버퍼 준비
  let buffer: ArrayBuffer
  if (typeof input === "string") {
    const buf = await readFile(input)
    buffer = toArrayBuffer(buf)
  } else if (Buffer.isBuffer(input)) {
    buffer = toArrayBuffer(input)
  } else {
    buffer = input
  }

  // hwpx-preserve: 원본 HWPX ZIP 직접 수정 (스타일 보존)
  if (outputFormat === "hwpx-preserve") {
    const format = detectFormat(buffer)
    // detectFormat은 ZIP이면 "hwpx" 반환 (XLSX/DOCX 포함), 세분화 필요
    if (format === "hwpx") {
      const zipFormat = await detectZipFormat(buffer)
      if (zipFormat !== "hwpx") {
        throw new Error(`hwpx-preserve 포맷은 HWPX 입력만 지원합니다 (감지된 포맷: ${zipFormat})`)
      }
    } else {
      throw new Error(`hwpx-preserve 포맷은 HWPX 입력만 지원합니다 (감지된 포맷: ${format})`)
    }
    const hwpxResult = await fillHwpx(buffer, values)
    return {
      output: hwpxResult.buffer,
      format: "hwpx-preserve",
      fill: { filled: hwpxResult.filled, unmatched: hwpxResult.unmatched },
    }
  }

  // 일반 경로: parse → IRBlock → fill → output
  const parsed = await parse(buffer)
  if (!parsed.success) {
    throw new Error(`서식 파싱 실패: ${parsed.error}`)
  }

  const fill = fillFormFields(parsed.blocks, values)
  const markdown = blocksToMarkdown(fill.blocks)

  if (outputFormat === "hwpx") {
    const hwpxBuffer = await markdownToHwpx(markdown)
    return { output: hwpxBuffer, format: "hwpx", fill }
  }

  return { output: markdown, format: "markdown", fill }
}

// ─── 게임체인저 API ─────────────────────────────────

export { compare, diffBlocks } from "./diff/compare.js"
export { extractFormFields, isLabelCell, extractFormSchema, inferFieldType } from "./form/recognize.js"
export type { FormFieldType, FormFieldSchema, FormSchemaResult } from "./form/recognize.js"
export { fillFormFields } from "./form/filler.js"
export { ValueCursor, formatFillValue, fillWithUniqueGuard } from "./form/match.js"
export type { FillValue, FillInput } from "./form/match.js"
export type { FillResult } from "./form/filler.js"
export { fillHwpx } from "./form/filler-hwpx.js"
export type { HwpxFillResult } from "./form/filler-hwpx.js"
export { extractClickHereFields } from "./form/click-here.js"
export type { ClickHereField } from "./form/click-here.js"
export { BUILTIN_TEMPLATES, resolveBuiltinTemplate, readBuiltinTemplate, readBuiltinTemplateSample } from "./form/templates.js"
export type { BuiltinTemplate } from "./form/templates.js"
export { placeSealHwpx } from "./form/seal.js"
export type { SealOp, SealPlacement, PlaceSealResult } from "./form/seal.js"
export { markdownToHwpx } from "./hwpx/generator.js"
export type { HwpxTheme, MarkdownToHwpxOptions } from "./hwpx/generator.js"
export type { PageOptions } from "./hwpx/gen-page.js"
export type {
  FormatProfile, TableProfile, CellProfile, BorderFillDef, BorderDef, CharPrDef,
} from "./hwpx/generator.js"
export { hwpxToProfile } from "./hwpx/extract-profile.js"
export { normalizeGongmunPreset, PRESET_ALIAS, incompatibleGongmunWarnings } from "./hwpx/gongmun.js"
export { isKnownFont, unknownFontWarnings } from "./hwpx/font-catalog.js"
export { lintGongmunText, gongmunLintWarnings } from "./hwpx/gongmun-lint.js"
export type { GongmunLintFinding } from "./hwpx/gongmun-lint.js"
export { lintMuncheText, muncheLintWarnings, usesGaejosikMunche } from "./hwpx/munche-lint.js"
export type { MuncheLintFinding, MuncheLineKind } from "./hwpx/munche-lint.js"
export {
  charWidthEm1000, measureTextWidth, simulateWrap, simulateWrapKeepWord, fitRatioForFewerLines,
  SPACE_EM_FIXED, SPACE_EM_FONT,
} from "./hwpx/text-metrics.js"
export type { MeasureOptions, WrapResult, WrapMode } from "./hwpx/text-metrics.js"
export type {
  GongmunOptions,
  GongmunPreset,
  GongmunPresetInput,
  GongmunNumbering,
  GongmunFont,
} from "./hwpx/gongmun.js"
export { patchHwpx } from "./roundtrip/patcher.js"
export { patchHwp } from "./roundtrip/hwp5-patch.js"
export type { PatchResult, PatchSkip, PatchOptions } from "./types.js"
export { validateHwpx } from "./validate.js"
export type { ValidateResult, ValidateIssue } from "./validate.js"
export { redactText, redactMarkdown, DEFAULT_REDACT_RULES } from "./redact.js"
export type { RedactRule, RedactHit, RedactTextResult, RedactOptions } from "./redact.js"
export { blocksToChunks } from "./chunks.js"
export type { DocChunk, ChunkOptions } from "./chunks.js"

// ─── 에디터 통합 API (v3.1) ─────────────────────────

export { HwpxSession, openHwpxDocument, patchHwpxBlocks } from "./roundtrip/session.js"
export type {
  BlockEdit, BlockCapability, BlockCapabilityInfo, CellCapability, BlockSourceRef,
} from "./roundtrip/session.js"
// 소스맵 저수준 API — 블록↔원본 바인딩을 직접 다루는 고급 사용자용
export { scanSectionXml, buildParagraphSplices, buildRangeSplices, applySplices } from "./roundtrip/source-map.js"
export type {
  SectionScan, ScanParagraph, ScanCell, ScanTable, ScanParaKind, SpliceEdit, TRange,
} from "./roundtrip/source-map.js"
export { renderHtml, markdownToPdf, blocksToPdf } from "./print/renderer.js"
export type { PrintPreset, PrintOptions, PageMargin } from "./print/renderer.js"
export { renderHwpxToSvg, renderDocument, renderDocumentToScene, extractRenderedRegions, renderSceneToHtml, renderHwp5Pages } from "./render/index.js"
// 표 분류·시각 추출 (#76)
export { classifyTable, collectTableBlocks } from "./table/classifier.js"
export type { ClassifyContext } from "./table/classifier.js"
export { classifyTableTree, chooseTableRepresentation } from "./table/analyze.js"
export type { TableRepresentation } from "./table/analyze.js"
export { hasStructuredCellContent, flattenLayoutTables } from "./table/builder.js"
export { extractTables } from "./table/visual.js"
export type { ExtractTableVisualOptions, ExtractedTable, ExtractedTableCrop, TableVisualPolicy } from "./table/visual.js"
export type {
  RenderSvgOptions, RenderSvgResult, RenderScene, ScenePage, RenderRegion, PageBBox, RenderObjectType, RenderSourceFormat,
  RenderFormat, RenderDocumentOptions, RenderDocumentResult, RenderAsset, SceneRenderOptions, SceneRenderResult,
  ExtractRegionOptions, RegionAsset,
} from "./render/index.js"

// ─── Re-exports ──────────────────────────────────────

export { detectFormat, detectOle2Format, detectZipFormat, isHwpxFile, isOldHwpFile, isPdfFile, isZipFile } from "./detect.js"
export type {
  ParseResult, ParseSuccess, ParseFailure, FileType,
  PageMarkdown, PageQuality, DocumentQualitySummary, OcrLine,
  IRBlock, IRBlockType, IRTable, IRCell, CellContext,
  BoundingBox, InlineStyle, ImageData, ExtractedImage,
  DocumentMetadata, ParseOptions, ErrorCode,
  ParseWarning, WarningCode, OutlineItem,
  DiffResult, BlockDiff, CellDiff, DiffChangeType,
  FormField, FormResult,
  OcrProvider, WatchOptions,
} from "./types.js"
export { blocksToMarkdown } from "./table/builder.js"
export { blocksToPages } from "./page-markdown.js"
export { VERSION } from "./utils.js"
