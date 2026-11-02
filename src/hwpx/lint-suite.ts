/**
 * 검수 묶음 — `kordoc lint` 와 MCP `lint_document` 가 같은 판정·같은 JSON 을 내도록 한곳에 모은다.
 * 표기법은 늘 켜고, 문체·윤문·구성·수치 대조·예산 검수는 옵트인(게이트는 프리셋에 맞춰 문체·구성을 켬).
 */

import { lintGongmunText, type GongmunLintFinding } from "./gongmun-lint.js"
import { lintMuncheText, usesGaejosikMunche, type MuncheLintFinding } from "./munche-lint.js"
import { lintSlopText } from "./slop-lint.js"
import { lintLogicText, usesLogicStructure } from "./logic-lint.js"
import { lintBudgetText } from "./budget-lint.js"
import { checkTableNumbers, numberBlocksFromIR, numberBlocksFromMarkdown, type NumberReview } from "./number-lint.js"
import { parseMarkdownToBlocks } from "./md-runs.js"
import type { GongmunPreset } from "./gongmun.js"

export interface LintSuiteOptions {
  /** 파싱한 문서 글(원고 전용 규칙 끔) */
  parsed?: boolean
  /** 파싱 IR 블록 — 수치 대조에 표 구조를 그대로 쓴다(없으면 마크다운에서 표를 다시 읽음) */
  irBlocks?: Parameters<typeof numberBlocksFromIR>[0]
  munche?: boolean
  numbers?: boolean
  budget?: boolean
  slop?: boolean
  logic?: boolean
  gate?: boolean
  /** 정규화된 프리셋 — 게이트 범위 */
  preset?: GongmunPreset
}

export interface LintSuiteResult {
  findings: GongmunLintFinding[]
  munche?: MuncheLintFinding[]
  slop?: GongmunLintFinding[]
  logic?: GongmunLintFinding[]
  budget?: GongmunLintFinding[]
  numbers?: { checked: number; review: NumberReview[] }
  summary: { total: number; errors: number; ok: boolean; gate?: boolean }
}

export function runLintSuite(text: string, opts: LintSuiteOptions = {}): LintSuiteResult {
  const { preset } = opts
  const findings = lintGongmunText(text, { document: true, parsed: opts.parsed })
  // 문체 검수는 옵트인 — 개조식이 아닌 원고에 적용하면 안 된다
  const munche = opts.munche || (opts.gate && preset && usesGaejosikMunche(preset)) ? lintMuncheText(text) : []
  const slop = opts.slop || opts.gate ? lintSlopText(text) : []
  const logic = (opts.logic || opts.gate) && (!preset || usesLogicStructure(preset)) ? lintLogicText(text) : []
  const budget = opts.budget ? lintBudgetText(text) : []
  const numbers = opts.numbers
    ? checkTableNumbers(opts.irBlocks ? numberBlocksFromIR(opts.irBlocks) : numberBlocksFromMarkdown(parseMarkdownToBlocks(text)))
    : undefined
  const err = (l: { severity: string }[]) => l.filter((f) => f.severity === "error").length
  const errors = err(findings) + err(munche) + err(slop) + err(logic) + err(budget)
  // 게이트는 윤문·구성 지적을 경고까지 막는다 (gongmun-gate.ts 와 같은 기준)
  const failed = errors > 0 || (!!opts.gate && slop.length + logic.length > 0)
  return {
    findings,
    ...(munche.length || opts.munche ? { munche } : {}),
    ...(opts.slop || opts.gate ? { slop } : {}),
    ...(opts.logic || opts.gate ? { logic } : {}),
    ...(opts.budget ? { budget } : {}),
    ...(numbers ? { numbers } : {}),
    summary: {
      total: findings.length + munche.length + slop.length + logic.length + budget.length,
      errors, ok: !failed, ...(opts.gate ? { gate: !failed } : {}),
    },
  }
}
