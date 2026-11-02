/**
 * 윤문 검수기 — 생성형 AI 초안이 공문서로 넘어올 때 남는 기계 문체(슬롭)를 잡는다.
 *
 * 표기법 검수(gongmun-lint.ts)의 `AI_EM_DASH`·`AI_BOLD_OVERUSE` 가 표기 흔적을, 문체 검수(munche-lint.ts)가
 * 개조식 종결을 본다면 이 모듈은 낱말·관용구를 본다. 결재권자가 "AI 가 썼네" 하고 읽는 지점이다.
 *
 * 등급 기준 (v4.22.17 실측): 실결재·방침서·기관 공개 문서 337건과 중앙부처 보도자료 501건(사람 글),
 * 같은 주제를 생성형 모델에 맡긴 개조식 보고서 초안 24건(AI 글)에서 문서 적중률을 쟀다.
 * - error: 사람 글 838건에서 0~1건인 관용구 — 결산 피벗("결론적으로"), 평론 상투구("시사하는 바가 크다")
 * - warning: 사람도 가끔 쓰지만 AI 초안에서 몰리는 것 — 체감·만족도 상투구(AI 29%, 사람 2% 이하),
 *   근거 없는 추상 성과 줄의 비율(사람 보고서 최대 11%, AI 최대 20%), 번역투·시대 상투구는 문서 안 반복만
 * 검수는 조언용이다 — `kordoc lint --gate`·`generate --gate` 만 error 에서 멈춘다. 상세 근거는 docs/gongmun-logic.md.
 */

import type { GongmunLintFinding } from "./gongmun-lint.js"

interface SlopRule {
  code: string
  severity: "error" | "warning"
  pattern: RegExp
  message: string
  suggest?: string
  /** 문서 안에서 이 횟수 이상일 때만 보고 — 사람 글에도 드문드문 나오는 표현 */
  minCount?: number
}

const RULES: SlopRule[] = [
  // 결산 피벗 — 개조식 공문은 장 이름(향후계획·조치계획)이 마무리를 맡는다. 사람 글 838건 중 0건
  { code: "SLOP_PIVOT", severity: "error", pattern: /결론적으로|요약하면|정리하면|요컨대|종합해 ?보면/g,
    message: "결산 접속어 — 공문은 장 이름이 마무리를 맡음(생성형 AI 문체)", suggest: "지우고 판단·조치를 바로 적음" },
  // 평론 상투구 — 사람 글 0건
  { code: "SLOP_SIGNATURE", severity: "error",
    pattern: /시사하는 바가|시사점이 크|주목할 만하|본질적으로|핵심적으로|게임 ?체인저|새로운 지평|새로운 장을 열|의미 있는 첫걸음/g,
    message: "평론·홍보 상투구(생성형 AI 문체)", suggest: "무엇이 달라지는지 수치·사실로" },
  // 사람도 쓰지만 AI 초안에 몰리는 홍보 상투구
  { code: "SLOP_HYPE", severity: "warning",
    pattern: /패러다임(?:의)? 전환|한 단계 도약|지금이야말로|초석이 될|발판이 될|획기적|압도적|파격적|비약적|전례 ?없는|극대화/g,
    message: "과장·홍보 상투구", suggest: "목표치·대상·기간으로 바꿔 씀" },
  // 시대 상투구 — 배경을 사실 대신 분위기로 여는 서두. 사람 글 문서 적중 1.5%(급변하는 26회가 대부분)
  { code: "SLOP_ERA_CLICHE", severity: "warning",
    pattern: /중요성이 (?:날로|점차|더욱|갈수록)|(?:관심|요구|필요성)이 (?:날로|점차|더욱|갈수록) (?:높아|커지|증대|증가)|급변하는|시대적 (?:요구|흐름|과제)|요구되는 시점|4차 산업혁명 시대|대전환 시대|뉴노멀/g,
    message: "시대·분위기로 여는 상투 서두 — 배경은 사실로 연다", suggest: "예) 「○○법」 개정(2026. 3. 1. 시행), 민원 412건(전년 대비 38%↑)" },
  // 체감·만족도 상투구 — AI 초안 29%, 사람 글 2% 이하
  { code: "SLOP_FEEL_GOOD", severity: "warning",
    pattern: /체감(?:도|형)? ?(?:높은|향상|제고)|만족도 (?:향상|제고|증진)|삶의 질 (?:향상|제고)|행복 ?(?:지수 )?(?:증진|향상)/g,
    message: "체감·만족도 상투구 — 무엇이 얼마나 나아지는지 없음", suggest: "예) 대기시간 25분→10분, 민원 30% 감소" },
  // 번역투 — 보도자료에도 흔해 문서 안 3회 이상만
  { code: "SLOP_TRANSLATIONESE", severity: "warning", minCount: 3,
    pattern: /에 있어서?(?![가-힣])|함에 있어|되어지|되어진|[을를] 가지고 있|에 대해서/g,
    message: "번역투 반복", suggest: "에 있어→에서, 되어지다→되다, 가지고 있다→있다, 에 대해서→를" },
  { code: "SLOP_TRIAD", severity: "warning", pattern: /, 그리고 /g,
    message: "'A, B, 그리고 C' 나열 — 영어식 3항 병렬", suggest: "A·B·C 또는 A, B 및 C" },
  // 메타 진입 — 줄 첫머리의 지시어가 앞 줄을 다시 받는 글쓰기(개조식은 줄마다 새 사실)
  { code: "SLOP_META_LEAD", severity: "warning", minCount: 2,
    pattern: /^[ \t]*(?:[-□○ㅇ❍◦ㆍ·•*>][ \t]*)?(?:이는|이를 통해|이러한|이와 같이|이에 따라|이로써)[ \t]/g,
    message: "줄 첫머리 지시어 반복 — 개조식은 줄마다 새 사실", suggest: "지시어를 지우고 주어·대상을 바로 씀" },
  { code: "SLOP_EMOJI", severity: "warning", pattern: /[✅✨❌⭐\u{1F300}-\u{1FAFF}]/gu,
    message: "그림 문자는 공문서에 쓰지 않음", suggest: "지움 또는 □·ㅇ·※ 부호로" },
  // 쌍점을 앞말에 붙인 "제목: 부제" 만 — 서울 방침서 과제 소제목 "○○ 운영 : ’30년 ○○개소"(쌍점 앞뒤 띄움)는 실물 관행
  { code: "SLOP_COLON_HEADING", severity: "warning", pattern: /^#{1,6}[ \t]+[^\n:：]{1,19}[^\s:：][:：][ \t]+\S/g,
    message: "'제목: 부제' 꼴 헤딩 — 장 이름은 명사구 하나", suggest: "예) Ⅱ. 현황 및 문제점" },
]

/** 추상 성과로 끝나는 줄 — 무엇을 얼마나가 없으면 결재권자가 읽고 넘긴다 */
const VAGUE_END = /(?:강화|제고|도모|증진|향상|활성화|구축|기여|확립|정착|내실화|극대화|선도|실현|조성|확산|고도화)[ \t]*(?:필요|추진|도모|기대)?[.。]?$/
/** 구체 닻 — 숫자·법령·영문 약어·자리표시(○○, 채울 값) 중 하나라도 있으면 구체 줄 */
const CONCRETE = /\d|○○|「|[A-Z]{2,}/
const BULLET = /^[ \t]*(?:[-□○ㅇ❍◦ㆍ·•▸*]|\d+[.)])[ \t]*(.+)$/
/** 비율 판정 하한 — 줄이 적으면 한두 줄로 비율이 튄다 */
const VAGUE_MIN_LINES = 10
/** 사람 보고서 최대 0.11, AI 초안 p90 0.13 */
const VAGUE_RATIO = 0.15

/**
 * 원고 윤문 검수. 코드펜스와 YAML 프런트매터는 건너뛴다(표기법 검수와 같은 원칙).
 * 표 줄은 낱말 규칙만 보고 줄 비율 계산에서는 뺀다.
 */
export function lintSlopText(text: string): GongmunLintFinding[] {
  const findings: GongmunLintFinding[] = []
  const pending = new Map<string, GongmunLintFinding[]>()
  const lines = text.split(/\r?\n/)
  let fence: string | null = null
  let bullets = 0
  const vague: { line: number; body: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = line.match(/^\s*(```+|~~~+)/)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence !== null) continue
    for (const r of RULES) {
      r.pattern.lastIndex = 0
      for (const m of line.matchAll(r.pattern)) {
        const hit: GongmunLintFinding = { line: i + 1, match: m[0].trim() || m[0], rule: r.code, severity: r.severity, message: r.message, suggest: r.suggest }
        if (r.minCount) {
          const list = pending.get(r.code) ?? []
          list.push(hit)
          pending.set(r.code, list)
        } else findings.push(hit)
      }
    }
    if (/^\s*\|/.test(line)) continue
    const b = BULLET.exec(line)
    if (!b) continue
    const body = b[1].replace(/\*\*/g, "").trim()
    if (body.length < 6) continue
    bullets++
    if (VAGUE_END.test(body) && !CONCRETE.test(body)) vague.push({ line: i + 1, body })
  }
  for (const r of RULES) {
    const list = r.minCount ? pending.get(r.code) : undefined
    if (list && list.length >= r.minCount!) findings.push(...list)
  }
  if (bullets >= VAGUE_MIN_LINES && vague.length >= 3 && vague.length / bullets >= VAGUE_RATIO) {
    const pct = Math.round((vague.length / bullets) * 100)
    for (const v of vague) {
      findings.push({ line: v.line, match: v.body.slice(0, 60), rule: "SLOP_VAGUE_OUTCOME", severity: "warning",
        message: `숫자·대상 없이 추상 성과로 끝나는 줄(문서 ${pct}% — 실결재 보고서 최대 11%)`,
        suggest: "무엇을·얼마나·언제까지 — 예) 상습 투기지점 42곳 CCTV 설치(12월)" })
    }
  }
  return findings.sort((a, b) => a.line - b.line)
}

/** 검수 결과를 사람이 읽는 경고 문자열 배열로 — generate 경고 채널(표기법·문체와 동일)용 */
export function slopLintWarnings(text: string, limit: number = 10): string[] {
  const findings = lintSlopText(text)
  const shown = findings.slice(0, limit).map(
    (f) => `윤문 [${f.rule}] L${f.line} "${f.match}" — ${f.message}${f.suggest ? ` (${f.suggest})` : ""}`,
  )
  if (findings.length > limit) shown.push(`윤문 경고 ${findings.length - limit}건 더 있음 — kordoc lint --gate 로 전체 확인`)
  return shown
}
