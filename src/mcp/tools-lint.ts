/** kordoc MCP 도구 — 공문서 검수 (lint_document). 판정은 CLI `kordoc lint` 와 같은 runLintSuite */

import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { PRESET_ALIAS } from "../hwpx/gongmun.js"
import { runLintSuite } from "../hwpx/lint-suite.js"
import { lintBlocks } from "../hwpx/lint-blocks.js"
import { KordocError } from "../utils.js"
import { MAX_FILE_SIZE, ALLOWED_EXTENSIONS, readValidatedFile, describeError, capResponseText } from "./shared.js"

/** 붙여 넣는 글 상한 — 공문서 한 건은 수만 자를 넘지 않는다. 그보다 크면 문서 파일로 */
const MAX_TEXT_CHARS = 1_000_000
/** blocks 입력 상한 — 열린 문서 한 건의 문단·칸 수 */
const MAX_BLOCKS = 20_000
/** 응답에 싣는 목록별 지적 상한 */
const MAX_LIST = 500

export function registerLintTools(server: McpServer): void {
  server.tool(
    "lint_document",
    "공문서 검수 — 표기법(날짜·시각·금액·붙임·외래어·쉬운 말·차별 표현)은 늘, 개조식 문체·윤문·구성·본문↔표 수치·예산(산출근거 검산·표 합계·합계 행 위치·외화 표기·증감 기준)은 골라 켭니다. " +
    "text(마크다운·평문, 한 줄 = 한 문단) 또는 file_path(HWP·HWPX·PDF 등) 중 하나. 결과 JSON 의 지적마다 line(1부터)·column(1부터, 문서 단위 지적엔 없음)·match·rule·severity·message·suggest — " +
    "열린 문서를 고치는 도구는 blocks(문단·표 칸마다 id·글·표 위치)로 넘기면 지적마다 block(id)·offset(블록 안 위치, 0부터)·length 로 돌려받습니다.",
    {
      text: z.string().max(MAX_TEXT_CHARS).optional().describe("검수할 글(마크다운·평문). file_path 와 둘 중 하나"),
      file_path: z.string().min(1).optional().describe("검수할 문서 파일의 절대 경로(HWP·HWPX·PDF·DOCX 등). text·blocks 와 셋 중 하나"),
      blocks: z.array(z.object({
        id: z.string().min(1).max(200),
        text: z.string().max(100_000),
        table: z.object({ id: z.string().min(1).max(200), row: z.number().int().min(0).max(10_000), col: z.number().int().min(0).max(1_000) }).optional(),
      })).max(MAX_BLOCKS).optional().describe("문서 순서대로 문단·표 칸 블록 — 표 칸은 table{id,row,col}(같은 id 칸이 한 표). 결과 지적은 block·offset·length. text·file_path 와 셋 중 하나"),
      munche: z.boolean().optional().describe("개조식 문체 검수(서술형 종결·당위·수사·항목 길이)"),
      slop: z.boolean().optional().describe("윤문 검수(생성형 AI 문체 흔적)"),
      logic: z.boolean().optional().describe("구성 검수(보고서·계획서 논리 구조)"),
      numbers: z.boolean().optional().describe("본문 수치 ↔ 표 수치 대조(확인 목록)"),
      budget: z.boolean().optional().describe("예산 문서 검수 — 산출근거 곱셈 검산, 표 합계 재계산·합계 행 위치(머리행 바로 아래), 외화(원화 먼저·환율 기준), 증감 기준(본예산/최종예산)"),
      gate: z.boolean().optional().describe("결재 전 게이트 — 표기법·문체 error 와 윤문·구성 지적이 있으면 summary.ok=false"),
      preset: z.string().optional().describe("게이트 범위를 맞출 프리셋(보고서·계획서·개조식 등, 한글 별칭 가능)"),
    },
    async ({ text, file_path, blocks, munche, slop, logic, numbers, budget, gate, preset }) => {
      try {
        if ([text, file_path, blocks].filter((v) => v !== undefined).length !== 1) throw new KordocError("text·file_path·blocks 중 정확히 하나를 주세요")
        // 자기 키만 — "constructor"·"__proto__" 같은 프로토타입 키가 프리셋으로 통과하지 않게
        const key = preset?.trim()
        const resolvedPreset = key !== undefined && Object.hasOwn(PRESET_ALIAS, key) ? PRESET_ALIAS[key] : undefined
        if (preset !== undefined && !resolvedPreset) throw new KordocError(`알 수 없는 프리셋: ${preset}`)
        if (blocks !== undefined) {
          if (blocks.reduce((n, b) => n + b.text.length, 0) > MAX_TEXT_CHARS) throw new KordocError(`블록 글 합이 ${MAX_TEXT_CHARS.toLocaleString()}자를 넘습니다 — 나눠서 검수하세요`)
          const r = lintBlocks(blocks, { preset: resolvedPreset, munche, slop, logic, numbers, budget, gate })
          const truncated = r.findings.length > MAX_LIST
          return { content: [{ type: "text", text: capResponseText(JSON.stringify({ summary: r.summary, ...(truncated ? { truncated } : {}), findings: r.findings.slice(0, MAX_LIST), ...(r.numbers ? { numbers: { ...r.numbers, review: r.numbers.review.slice(0, MAX_LIST) } } : {}) })) }] }
        }
        let body = text ?? ""
        let irBlocks
        if (file_path !== undefined) {
          const { buffer, resolved } = await readValidatedFile(file_path, MAX_FILE_SIZE, ALLOWED_EXTENSIONS)
          const { parse } = await import("../index.js")
          const parsed = await parse(buffer, { filePath: resolved })
          if (!parsed.success) throw new KordocError(`문서를 읽지 못했습니다 — ${parsed.error}`)
          body = parsed.markdown
          irBlocks = parsed.blocks
          // 파일은 500MB 까지 받지만 검수할 글은 붙여 넣기와 같은 상한 — 정규식 검수 시간·응답 크기를 묶는다
          if (body.length > MAX_TEXT_CHARS) throw new KordocError(`문서 글이 ${MAX_TEXT_CHARS.toLocaleString()}자를 넘습니다 — 나눠서 검수하세요`)
        }
        const result = runLintSuite(body, {
          parsed: file_path !== undefined, irBlocks, preset: resolvedPreset,
          munche, slop, logic, numbers, budget, gate,
        })
        // 요약을 맨 앞에, 들여쓰기 없이 — 응답 상한에 걸려 잘려도 summary 는 남는다. 목록마다 상한 — JSON 을 다 만든 뒤 자르면 메모리가 먼저 부푼다. 잘랐으면 truncated 로 알린다
        let truncated = false
        const cap = <T,>(l: T[] | undefined) => (l && l.length > MAX_LIST ? ((truncated = true), l.slice(0, MAX_LIST)) : l)
        const shown = {
          ...result, findings: cap(result.findings)!, munche: cap(result.munche), slop: cap(result.slop), logic: cap(result.logic), budget: cap(result.budget),
          ...(result.numbers ? { numbers: { ...result.numbers, review: cap(result.numbers.review)! } } : {}),
        }
        return { content: [{ type: "text", text: capResponseText(JSON.stringify((({ summary, ...lists }) => ({ summary, ...(truncated ? { truncated } : {}), ...lists }))(shown))) }] }
      } catch (err) {
        return { content: [{ type: "text", text: `오류: ${describeError(err)}` }], isError: true }
      }
    },
  )
}
