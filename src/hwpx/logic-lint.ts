/**
 * 구성(논리 구조) 검수기 — 보고서·계획서가 결재권자를 설득하는 흐름을 갖췄는지 본다.
 *
 * 공문의 서론·본론·결론은 장 이름으로 드러난다: 왜(추진배경·관련근거·현황·문제점) → 무엇을(추진개요·개선방안·
 * 세부내용) → 어떻게(추진일정·소요예산·향후계획·행정사항). 이 모듈은 장마다 역할을 매기고
 * (1) 세 역할이 다 있는지 (2) 왜가 무엇보다 앞서는지 (3) 문제점마다 대응 방안이 있는지 (4) 배경·기대효과가
 * 사실과 목표치로 쓰였는지를 검사한다. 장 이름을 "서론·본론·결론"으로 적은 원고는 막는다.
 *
 * 근거: 행정업무운영편람 보고서 표준 목차(추진배경 → 현황 → 문제점 → 개선방안 → 기대효과 → 추진계획)와
 * 계획서 관행(추진배경 → 방향 → 세부계획 → 예산 → 일정 → 행정사항) — docs/gongmunseo-reference.md.
 * 실결재 보고서는 장 이름이 이 틀을 따르고, 같은 주제의 생성형 AI 초안 24건도 장 이름은 틀을 채웠다 —
 * 갈린 곳은 장 사이 연결이었다(배경에 사실이 없음, 문제점과 방안이 따로 놂, 기대효과에 목표치가 없음).
 * 검수는 조언용이다 — `kordoc lint --gate`·`generate --gate` 만 error 에서 멈춘다. 상세는 docs/gongmun-logic.md.
 */

import type { GongmunLintFinding } from "./gongmun-lint.js"
import { normalizeGongmunPreset } from "./gongmun.js"

/** 논리 구조를 검사하는 프리셋 — 보고서·계획서 계열. 기안문·통지·회의록·보도자료는 법정·관행 서식이 따로 있다 */
export function usesLogicStructure(preset?: string): boolean {
  const p = normalizeGongmunPreset(preset)
  return p === "report" || p === "plan" || p === "gaejosik" || p === "ministry" || p === "bangchim"
}

type Role = "basis" | "status" | "problem" | "plan" | "exec" | "effect"

interface Section {
  line: number
  title: string
  roles: Set<Role>
  /** 장 본문 줄 (표 줄 포함) */
  body: { line: number; text: string }[]
}

const ESSAY = /^(?:서론|본론|결론|맺음말|맺는말|들어가며|들어가는 ?말|나가며|나오며|마치며|결어|요약 ?및 ?결론)$/
const ROLE_RE: [Role, RegExp][] = [
  ["exec", /일정|예산|재원|소요|행정사항|협조|조치계획|향후|추진체계|역할|건의|사후관리|성과관리/],
  ["effect", /기대효과|효과/],
  ["basis", /배경|근거|필요성|목적|경위|경과|계기/],
  ["problem", /문제|한계|애로/],
  ["status", /현황|실태|여건|진단|분석/],
  ["plan", /방안|대책|개선|방향|목표|전략|과제|세부|내용|추진계획|운영계획|사업계획|기본계획|개요|검토의견|대안|결과|실적/],
]

/** 장 이름에서 번호·부호·강조를 걷어낸 알맹이 */
function headingText(raw: string): string | null {
  // 굵게로 감싼 장 이름(**3. 추진 목표**)도 장이다
  let t = raw.trim().replace(/^\*\*(.+)\*\*$/, "$1")
  // `#` 은 문서 제목(공문서 모드 규약) — 장이 아니다. 장은 `##` 부터
  if (/^#\s/.test(t)) return null
  const md = /^#{2,6}\s+(.+)$/.exec(t)
  if (md) t = md[1]
  else if (/^□/.test(t)) t = t.slice(1)
  else if (!/^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]?|\d{1,2}\s*[.．])\s*[^\s\d]/.test(t) || /^\s/.test(raw)) return null
  t = t.replace(/\*\*|__/g, "").replace(/^\s*(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.．]?|(?:\d{1,2}|[가-하])\s*[.．)])\s*/, "").trim()
  // 장 이름은 짧은 명사구 — 문장(종결·쉼표 나열)이나 긴 줄은 □ 소제목 본문이다
  if (t.length < 2 || t.length > 24 || /[.。]$|다$|함$|음$|,/.test(t)) return null
  return t
}

function rolesOf(title: string): Set<Role> {
  const c = title.replace(/\s/g, "")
  const roles = new Set<Role>()
  for (const [r, re] of ROLE_RE) if (re.test(c)) roles.add(r)
  // "향후 추진계획"·"세부일정" 은 실행, "세부 추진계획" 은 내용 — 실행으로 잡혔으면 방안·과제 말이 없는 한 계획 겹침은 걷는다
  if (roles.has("exec") && !/방안|대책|전략|과제|내용/.test(c)) roles.delete("plan")
  return roles
}

/** 첫 장 앞 보고 목적 문장 — "…하고자 함"(요약박스·리드문). 실결재 방침서는 배경 장 없이 이 한 문장이 왜를 맡기도 한다 */
const PURPOSE = /(?:고자|려고)\s*함\.?$|보고(?:드림|함)\.?$/

function splitSections(text: string): { sections: Section[]; essay: GongmunLintFinding[]; purpose: boolean } {
  const sections: Section[] = []
  let purpose = false
  const essay: GongmunLintFinding[] = []
  let fence: string | null = null
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const f = raw.match(/^\s*(```+|~~~+)/)
    if (f) {
      if (fence === null) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence !== null || !raw.trim()) continue
    const h = /^\s*\|/.test(raw) ? null : headingText(raw)
    if (h !== null) {
      if (ESSAY.test(h.replace(/\s+/g, " "))) {
        essay.push({ line: i + 1, match: h, rule: "LOGIC_ESSAY_HEADING", severity: "error",
          message: "장 이름을 서론·본론·결론으로 적음 — 공문은 그 흐름을 실무 장 이름으로 드러냄",
          suggest: "왜: 추진배경·관련근거·현황 및 문제점 → 무엇: 추진개요·개선방안·세부내용 → 어떻게: 추진일정·소요예산·향후계획" })
      }
      const roles = rolesOf(h)
      if (roles.size) {
        sections.push({ line: i + 1, title: h, roles, body: [] })
        continue
      }
      // 역할 없는 하위 제목(가. 감시체계 강화)은 앞 장의 본문으로 둔다
    }
    if (!sections.length && PURPOSE.test(raw.replace(/^\s*>\s*|\*\*/g, "").trim())) purpose = true
    sections.at(-1)?.body.push({ line: i + 1, text: raw })
  }
  return { sections, essay, purpose }
}

/** 사실 닻 — 숫자, 법령 낫표, 채울 자리표시(○○·[ ]). 자리표시는 "지어내지 말 것" 규칙과 짝이라 사실 자리로 친다 */
const FACT = /\d|「|○○|○[가-힣%]|\[\s*\]/
const STOP = new Set([
  "문제", "문제점", "부족", "미흡", "한계", "곤란", "필요", "증가", "감소", "발생", "현황", "위한", "대한", "관련",
  "개선", "강화", "운영", "추진", "확대", "체계", "관리", "지원", "우려", "저하", "어려움", "부재", "중심", "위주",
  "있음", "없음", "대응", "실시", "기존", "현행", "따른", "인한", "통한", "등의",
])
const JOSA = /(?:으로|에서|에게|까지|부터|이나|과의|와의|으로의|에의|의|은|는|이|가|을|를|에|로|과|와|도|만)$/

/** 문제점 줄의 핵심 낱말 — 조사·흔한 서술어를 걷은 두 글자 이상 한글 낱말 */
function keyTerms(s: string): string[] {
  const out: string[] = []
  for (let w of s.replace(/\*\*|\([^)]*\)/g, " ").split(/[^가-힣]+/)) {
    if (w.length > 2) w = w.replace(JOSA, "")
    if (w.length >= 2 && !STOP.has(w)) out.push(w)
  }
  return out
}

const TOP_BULLET = /^(?:[-□○ㅇ❍◦•*]|\d+[.)])\s*(.+)$/

/** 문제점 항목 — 문제 장의 첫 단계 줄, 또는 "문제점" 칸이 있는 표의 그 칸 */
function problemItems(sections: Section[]): { line: number; text: string }[] {
  const items: { line: number; text: string }[] = []
  for (const s of sections) {
    const pure = s.roles.has("problem") && !s.roles.has("status")
    let inProblem = pure
    /** 문제점 표지 줄의 들여쓰기 — 그 아래 한 단계 줄이 문제 항목, 같은 깊이의 다음 줄이 오면 표지 구간 끝 */
    let markIndent = pure ? -1 : -2
    let base = -1
    let col = -1
    for (const b of s.body) {
      const t = b.text
      if (/^\s*\|/.test(t)) {
        const cells = t.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
        const hc = cells.findIndex((c) => /문제/.test(c) && c.length <= 8)
        if (hc >= 0) { col = hc; continue }
        if (col >= 0 && cells[col]) items.push({ line: b.line, text: cells[col] })
        continue
      }
      col = -1
      const indent = t.length - t.trimStart().length
      // 현황과 문제점을 한 장에 쓴 원고는 "문제점" 표지 줄(- (문제점)·**문제점**) 아래부터
      if (!pure && /문제점|\(문제\)|<\s*문제/.test(t) && t.replace(/[^가-힣]/g, "").length <= 8) {
        inProblem = true; markIndent = indent; base = -1; continue
      }
      if (!inProblem) continue
      const m = TOP_BULLET.exec(t.trim())
      if (!m) continue
      if (indent <= markIndent) { inProblem = false; continue }
      if (base < 0) base = indent
      const item = m[1].replace(/\*/g, "").trim()
      // 【추진과제 측면】 같은 묶음 표지는 항목이 아니다
      if (indent === base && !/^[【\[<(].*[】\]>)]$/.test(item) && item.replace(/[^가-힣]/g, "").length >= 4) items.push({ line: b.line, text: item })
    }
  }
  return items
}

const bodyText = (ss: Section[]): string => ss.flatMap((s) => [s.title, ...s.body.map((b) => b.text)]).join("\n")
const has = (s: Section, ...rs: Role[]): boolean => rs.some((r) => s.roles.has(r))

/**
 * 원고 논리 구조 검수. 역할이 매겨지는 장이 셋 이상인 원고(보고서·계획서 꼴)만 구성 규칙을 판정한다 —
 * 한 쪽짜리 기안문·통지문은 장 구성이 따로 없다. "서론·본론·결론" 장 이름은 원고 꼴과 상관없이 잡는다.
 */
export function lintLogicText(text: string): GongmunLintFinding[] {
  const { sections, essay, purpose } = splitSections(text)
  const findings: GongmunLintFinding[] = [...essay]
  if (sections.length < 3) return findings
  const why = sections.filter((s) => has(s, "basis", "status", "problem"))
  const what = sections.filter((s) => has(s, "plan"))
  const how = sections.filter((s) => has(s, "exec"))
  const effect = sections.filter((s) => has(s, "effect"))
  const at = (s: Section | undefined) => s?.line ?? 1
  const add = (line: number, match: string, rule: string, severity: "error" | "warning", message: string, suggest?: string) =>
    findings.push({ line, match: match.slice(0, 60), rule, severity, message, suggest })

  // 개요·결과 장만 있는 원고(결과보고·행사 개요)는 제안이 아니다 — 방안·전략을 내미는 장이 있을 때만 왜를 묻는다
  const proposal = what.find((s) => /방안|대책|방향|전략|과제|세부|추진계획|운영계획|사업계획|기본계획|대안|검토의견|추진내용|주요내용/.test(s.title))
  if (proposal && !why.length && !purpose) {
    add(proposal.line, proposal.title, "LOGIC_NO_WHY", "error",
      "왜 해야 하는지(추진배경·관련근거·현황·문제점) 장이 없음 — 방안부터 내밀면 결재권자가 설득되지 않음",
      "첫 장에 추진배경(계기·법령·지시·수치) 또는 현황 및 문제점")
  }
  if (proposal && !how.length) {
    add(at(what.at(-1)), what.at(-1)!.title, "LOGIC_NO_HOW", "warning",
      "어떻게·언제·얼마(추진일정·소요예산·향후계획·행정사항) 장이 없음 — 결재 뒤 실행이 안 보임",
      "마지막 장에 추진일정·소요예산·향후계획(담당·기한)")
  }
  if (why.length && proposal && why[0].line > proposal.line) {
    add(at(why[0]), why[0].title, "LOGIC_ORDER", "warning",
      `'${why[0].title}'이(가) '${proposal.title}' 뒤에 옴 — 왜(배경·현황)를 먼저 세우고 무엇(방안)을 냄`)
  }
  // 배경·현황은 사실로 — 시대 분위기만으로 연 서두는 설득 근거가 아니다
  if (why.length && !FACT.test(bodyText(why))) {
    add(at(why[0]), why[0].title, "LOGIC_BASIS_NO_FACT", "warning",
      "배경·현황 장에 사실(수치·법령·지시·날짜)이 없음 — 왜 지금 해야 하는지가 안 보임",
      "예) 「○○법」 개정(2026. 3. 1. 시행), 최근 3년 민원 1,240건(연 18%↑), 구청장 지시(2026. 9. 1.)")
  }
  // 문제점마다 대응 방안 — 문제 제기만 하고 방안이 따로 노는 원고
  const problems = problemItems(sections)
  if (problems.length && what.length) {
    const sol = bodyText([...what, ...how, ...effect])
    for (const p of problems) {
      const terms = keyTerms(p.text)
      if (terms.length && !terms.some((t) => sol.includes(t))) {
        add(p.line, p.text, "LOGIC_PROBLEM_UNANSWERED", "warning",
          "이 문제점에 대응하는 방안이 보이지 않음 — 문제점과 방안은 짝을 이룸", "방안 장에 이 문제의 해법을 한 줄 이상")
      }
    }
  }
  if (problems.length && !what.length) {
    add(problems[0].line, problems[0].text, "LOGIC_PROBLEM_UNANSWERED", "warning",
      "문제점만 있고 방안·대책 장이 없음", "개선방안 장을 문제점 순서대로")
  }
  const remedy = what.find((s) => /개선|대책|방안/.test(s.title))
  if (remedy && !sections.some((s) => has(s, "status", "problem"))) {
    add(remedy.line, remedy.title, "LOGIC_UNGROUNDED", "warning",
      "개선방안의 근거(현황·문제점) 장이 없음 — 무엇을 고치는지 먼저 보여야 함", "개선방안 앞에 현황 및 문제점")
  }
  // 기대효과·실행 장은 목표치·날짜·금액으로 — "만족도 향상"만으로는 결재 근거가 되지 않는다
  for (const s of effect) {
    if (s.body.length && !FACT.test(bodyText([s]))) {
      add(s.line, s.title, "LOGIC_EFFECT_VAGUE", "warning",
        "기대효과에 목표치가 없음 — 문제점에서 든 지표가 얼마나 나아지는지로", "예) 상습 투기지점 민원 연 412건 → 200건(51%↓)")
    }
  }
  for (const s of how) {
    if (s.body.length && !FACT.test(bodyText([s])) && !/협조|역할|체계|건의|행정/.test(s.title)) {
      add(s.line, s.title, "LOGIC_EXEC_VAGUE", "warning",
        "일정·예산 장에 날짜·금액·기한이 없음", "예) 2026. 11.∼12. 설치, 총 84,000,000원(구비 100%)")
    }
  }
  return findings.sort((a, b) => a.line - b.line)
}

/** 검수 결과를 사람이 읽는 경고 문자열 배열로 — generate 경고 채널(표기법·문체와 동일)용 */
export function logicLintWarnings(text: string, limit: number = 10): string[] {
  const findings = lintLogicText(text)
  const shown = findings.slice(0, limit).map(
    (f) => `구성 [${f.rule}] L${f.line} "${f.match}" — ${f.message}${f.suggest ? ` (${f.suggest})` : ""}`,
  )
  if (findings.length > limit) shown.push(`구성 경고 ${findings.length - limit}건 더 있음 — kordoc lint --gate 로 전체 확인`)
  return shown
}
