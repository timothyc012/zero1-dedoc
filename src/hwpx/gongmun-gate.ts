/**
 * 공문서 게이트 — 표기법·문체·윤문·구성 검수를 한 번에 돌리고 통과 여부를 판정한다.
 *
 * 막는 기준: 표기법·문체는 error 만, 윤문(AI 문체)·구성(논리 구조)은 경고까지. 앞의 둘은 관행 차이가 섞여
 * 경고를 막으면 사람 원고까지 걸리지만, 뒤의 둘은 결재권자가 "AI 가 썼다"·"왜 하는지 모르겠다"로 읽는 지점이라
 * 게이트에서는 남기지 않는다(실결재·방침서 337건 중 5.9%, 생성형 AI 초안 24건 중 71% 가 걸림 — docs/gongmun-logic.md).
 * `kordoc lint --gate`·`kordoc generate --gate`·MCP `generate_document` 의 `gate` 가 이 판정을 쓴다.
 */

import { lintGongmunText, type GongmunLintFinding } from "./gongmun-lint.js"
import { lintMuncheText, usesGaejosikMunche } from "./munche-lint.js"
import { lintSlopText } from "./slop-lint.js"
import { lintLogicText, usesLogicStructure } from "./logic-lint.js"

export type GongmunGateAxis = "표기법" | "문체" | "윤문" | "구성"
export interface GongmunGateFinding extends GongmunLintFinding { axis: GongmunGateAxis }
export interface GongmunGateResult {
  pass: boolean
  /** 게이트를 막는 지적 — 고쳐야 통과 */
  blocking: GongmunGateFinding[]
  /** 참고 지적 (표기법·문체 경고) */
  advisory: GongmunGateFinding[]
}

/**
 * preset 을 주면 그 프리셋에 맞는 축만 돈다(문체는 개조식 계열, 구성은 보고서·계획서 계열).
 * preset 이 없으면 문체는 opts.munche 일 때만, 구성은 원고에 장이 셋 이상일 때 스스로 판정한다.
 */
export function gongmunGate(
  text: string,
  opts?: { preset?: string; document?: boolean; parsed?: boolean; munche?: boolean },
): GongmunGateResult {
  const tag = (axis: GongmunGateAxis, fs: GongmunLintFinding[]): GongmunGateFinding[] =>
    fs.map((f) => ({ line: f.line, match: f.match, rule: f.rule, severity: f.severity, message: f.message, suggest: f.suggest, axis }))
  const preset = opts?.preset
  const munche = opts?.munche || (preset !== undefined && usesGaejosikMunche(preset))
  const logic = preset === undefined || usesLogicStructure(preset)
  const strict = [
    ...tag("표기법", lintGongmunText(text, { document: opts?.document, parsed: opts?.parsed })),
    ...(munche ? tag("문체", lintMuncheText(text)) : []),
  ]
  const blocking = [
    ...strict.filter((f) => f.severity === "error"),
    ...tag("윤문", lintSlopText(text)),
    ...(logic ? tag("구성", lintLogicText(text)) : []),
  ].sort((a, b) => a.line - b.line)
  return { pass: blocking.length === 0, blocking, advisory: strict.filter((f) => f.severity !== "error") }
}

/** 사람이 읽는 게이트 지적 한 줄 */
export function formatGateFinding(f: GongmunGateFinding): string {
  return `${f.axis} [${f.rule}] L${f.line} "${f.match}" — ${f.message}${f.suggest ? ` (${f.suggest})` : ""}`
}
