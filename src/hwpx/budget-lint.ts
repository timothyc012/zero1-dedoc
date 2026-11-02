/**
 * 예산 문서 검수 — 산출근거 검산, 표 합계 재계산·합계 행 위치, 외화 표기, 증감 기준.
 *
 * 구청 예산편성 보고서 작업에서 실무자가 실제로 짚은 오류를 규칙으로 옮겼다(2026-10):
 * 산출근거가 총액과 안 맞음(단가 × 수량 × 기간), 기준 숫자를 바꾼 뒤 합계를 다시 안 셈, 달러만 적고 원화·환율 기준이 없음,
 * "전년 대비 증"의 기준이 본예산인지 최종예산인지 불분명. `kordoc lint --budget` 에서만 켠다 — 검산·합계가 틀린 것은
 * error(exit 1), 나머지는 warning.
 */

import { type GongmunLintFinding } from "./gongmun-lint.js"
import { TOTAL_LABEL_RE } from "./gen-table.js"

export type BudgetLintFinding = GongmunLintFinding

/** 금액 단위 → 원 배수 */
const MONEY_UNIT: Record<string, number> = { 원: 1, 천원: 1e3, 만원: 1e4, 백만원: 1e6, 억원: 1e8 }
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`
const MUL = String.raw`[×xX*✕]`
/** 인자: 수 + (단위) — "21,400원", "1,400명", "12월", "15%" */
const FACTOR = String.raw`${NUM}\s{0,2}(?:%|[가-힣]{1,3})?`
// 폭주 방지 — 숫자 런 첫머리에서만 시작(gongmun-lint 와 같은 원칙), 공백·곱셈 사슬 길이에 상한을 둬 시작 자리마다
// 끝까지 훑지 않게 한다("1×" 반복·긴 공백 줄이 이차였다). 산출근거 곱은 많아야 단가·수량·기간·비율 몇 개.
// 앞이 연산자면 더 긴 식의 뒷부분이다("400,000원 × 2명 + 200,000원 × 3명 = …", 앞 줄에서 이어지는 "+ …") — 판정하지 않는다.
// 다만 "-"·"*" 는 앞에 글자가 없으면 목록 부호("- 200,000원 × 2회 = …")라 식의 시작이다
const CALC_RE = new RegExp(
  String.raw`(?<![\d,.])(?<![+−×xX✕]\s{0,8})(?<!\S\s{0,8}[\-*]\s{0,8})(${FACTOR}(?:\s{0,3}${MUL}\s{0,3}${FACTOR}){1,8})\s{0,3}=\s{0,3}(${NUM})\s{0,2}(원|천원|만원|백만원|억원)`,
  "g",
)
const FACTOR_RE = new RegExp(String.raw`(${NUM})\s{0,2}(%|[가-힣]{1,3})?`, "g")
/** 산출근거 한 줄로 볼 수 있는 길이 — 넘는 줄(붙여 넣은 자료 덩어리)은 검산하지 않는다 */
const CALC_MAX_LINE = 2000
/** 이보다 큰 표는 합계 검사에서 뺀다(행 × 열 비용 상한) */
const TABLE_MAX_ROWS = 500
const TABLE_MAX_COLS = 64
/** 지적 상한 — 실제 예산 문서는 수십 건을 넘지 않는다. 악의적 입력이 응답·메모리를 부풀리지 않게 */
export const MAX_FINDINGS = 1000

const toNum = (s: string) => Number(s.replace(/,/g, ""))
/** 단위에 맞춘 표기 — 정수면 쉼표, 소수는 둘째 자리까지 */
function fmt(n: number): string {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? r.toLocaleString("en-US") : r.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

/** "단가 × 수량 × 기간 = 금액" 검산 — 다르면 바른 금액 */
function checkCalc(line: string, no: number, out: BudgetLintFinding[]): void {
  if (line.length > CALC_MAX_LINE) return
  CALC_RE.lastIndex = 0
  for (const m of line.matchAll(CALC_RE)) {
    let product = 1
    let money = false
    FACTOR_RE.lastIndex = 0
    for (const f of m[1].matchAll(FACTOR_RE)) {
      const unit = f[2] ?? ""
      let v = toNum(f[1])
      if (unit === "%") v /= 100
      else if (Object.hasOwn(MONEY_UNIT, unit)) { v *= MONEY_UNIT[unit]; money = true }
      product *= v
    }
    // 금액 인자가 하나도 없으면(인원 × 횟수 = …원) 단위를 알 수 없어 판정하지 않는다
    if (!money) continue
    const expected = product / MONEY_UNIT[m[3]]
    const got = toNum(m[2])
    // 적은 자릿수 아래 끝수는 반올림·절사 어느 쪽이든 허용 — "46천원"은 1천원, "1.9억원"은 0.1억원 단위
    const step = 10 ** -(m[2].split(".")[1]?.length ?? 0)
    if (Math.abs(expected - got) < step) continue
    out.push({
      line: no, column: (m.index ?? 0) + 1, match: m[0], rule: "BUDGET_CALC_MISMATCH", severity: "error",
      message: "산출근거 곱셈 결과가 적은 금액과 다름",
      // "원래 식 → 바른 식" — 그대로 바꿔 넣을 수 있는 꼴(편집 도구가 바로 반영)
      suggest: `${m[0]} → ${m[1].trim()} = ${fmt(expected)}${m[3]}`,
    })
  }
}

/** 소계 행 — "소계", "소계(A)", "소 계 (가)" */
const SUBTOTAL_RE = /^소\s*계\s*(?:\([^)]{1,10}\))?$/
/** 비율·단가·평균 열은 더하는 값이 아니다(머리 칸으로 판정) */
const NON_ADDITIVE_HEAD = /률|율|비율|%|단가|평균/
/** 비율·평균 행(구성비 100 등)도 더하지 않는다 — 행 이름이 비율 낱말 그 자체일 때만("효율"·"법률"·"국비 50%" 행은 더한다) */
const NON_ADDITIVE_ROW = /^(?:구성비|비중|평균|단가|환율|[가-힣]{0,4}(?:비율|증감률|증감율|집행률|집행율|달성률|달성율))(?:\(%\))?$/
const plainCell = (c: string) => c.replace(/[*_`]/g, "").trim()
/** 표 칸 수 — "1,200"·"△300"(감소)·"-"(없음). 수가 아니면 null */
function cellNum(c: string): number | null {
  const t = plainCell(c)
  if (t === "" || t === "-" || t === "–") return 0
  const m = t.match(/^([△▲-])?\s*(\d[\d,]*(?:\.\d+)?)$/)
  if (!m) return null
  const v = toNum(m[2])
  return m[1] === "△" || m[1] === "-" ? -v : v
}

type Row = { cells: string[]; line: number; raw: string }
/** 행 원문에서 c 번째 칸 글자의 1부터 센 위치 */
function cellColumn(r: Row, c: number): number {
  let at = r.raw.indexOf("|")
  for (let k = 0; k < c && at >= 0; k++) at = r.raw.indexOf("|", at + 1)
  if (at < 0) return 1
  let p = at + 1
  while (p < r.raw.length && (r.raw[p] === " " || r.raw[p] === "\t")) p++
  return p + 1
}

/** GFM 표 한 개 — 합계 재계산과 위치 */
function checkTable(rows: Row[], out: BudgetLintFinding[]): void {
  if (rows.length < 3 || rows.length > TABLE_MAX_ROWS) return
  const cols = rows.reduce((n, r) => Math.max(n, r.cells.length), 0)
  if (cols > TABLE_MAX_COLS) return
  const body = rows.slice(1)
  const labelAt = (r: Row) => Math.max(0, r.cells.findIndex((c) => plainCell(c)))
  const label = (r: Row) => plainCell(r.cells[labelAt(r)] ?? "")
  const totals = body.filter((r) => TOTAL_LABEL_RE.test(label(r)))
  if (totals.length !== 1) return
  const total = totals[0]
  if (rows.indexOf(total) !== 1) {
    out.push({
      line: total.line, column: cellColumn(total, labelAt(total)), match: label(total), rule: "BUDGET_TOTAL_POSITION", severity: "warning",
      message: "합계 행은 머리행 바로 아래에 두는 것이 공문 표 관행", suggest: "합계 행을 머리행 다음 줄로 옮기기",
    })
  }
  const subs = body.filter((r) => SUBTOTAL_RE.test(label(r)))
  // 소계가 있으면 합계 = 소계들의 합, 없으면 나머지 행의 합
  const parts = subs.length ? subs : body.filter((r) => r !== total && !NON_ADDITIVE_ROW.test(label(r).replace(/\s+/g, "")))
  for (let c = 0; c < cols; c++) {
    const cell = plainCell(total.cells[c] ?? "")
    // 합계 칸의 "-" 는 해당 없음(0 이 아니다), 비율·단가 열은 합계 대상이 아니다
    if (cell === "" || cell === "-" || cell === "–" || NON_ADDITIVE_HEAD.test(plainCell(rows[0].cells[c] ?? ""))) continue
    const t = cellNum(cell)
    if (t === null) continue
    const vals = parts.map((r) => cellNum(r.cells[c] ?? ""))
    // 글이 섞인 열(비고 등)은 합계 대상이 아니다
    if (vals.some((v) => v === null)) continue
    const sum = (vals as number[]).reduce((a, b) => a + b, 0)
    if (Math.abs(sum - t) < 0.005) continue
    out.push({
      line: total.line, column: cellColumn(total, c), match: cell, rule: "BUDGET_TOTAL_MISMATCH", severity: "error",
      message: `합계가 ${subs.length ? "소계" : "항목"}의 합과 다름(${c + 1}번째 열)`, suggest: `${cell} → ${fmt(sum)}`,
    })
  }
}

const SYMBOL_RE = /\$\s?\d|(?<![A-Za-z])USD(?![A-Za-z])/g
const DOLLAR_RE = /(?<![\d,.])(\d[\d,]*(?:\.\d+)?)\s*달러/g
const WON_RE = /(?<![\d,.])\d[\d,]*(?:\.\d+)?\s*(?:천\s*|만\s*|백만\s*|억\s*)?원/
const BASIS_RE = /(?:대비|비해)[^\n]{0,40}?(?<![가-힣])(?:증|감|증가|감소)(?![가-힣])/
const BASIS_NAMED_RE = /본예산|최종\s*예산|추경|추가경정|당초\s*예산|결산/
/** GFM 구분 줄(|---|:--:|) — 생성기와 같이 대시 1개 이상. 파이프를 반드시 요구(`\|?` 가 비면 \s*\s* 가 겹쳐 이차였다) */
const SEPARATOR_RE = /^\s*\|\s*:?-+:?\s*(?:\||$)/

/** 예산 문서 검수. 마크다운(파싱한 글 포함)을 줄 단위로 본다 */
export function lintBudgetText(text: string): BudgetLintFinding[] {
  const out: BudgetLintFinding[] = []
  const lines = text.split(/\r?\n/)
  let table: Row[] = []
  const flush = () => { if (table.length) checkTable(table, out); table = [] }
  let dollarLine = 0
  let hasRate = false
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    if (out.length >= MAX_FINDINGS) break
    const line = lines[i]
    const no = i + 1
    // 코드 펜스 안은 건너뛴다(표기법 검수와 같은 규칙 — 같은 마커 종류로만 닫힘)
    const fm = line.match(/^\s*(```+|~~~+)/)
    if (fm) {
      if (fence === null) fence = fm[1][0]
      else if (fm[1][0] === fence) fence = null
      continue
    }
    if (fence !== null) continue
    if (/환율/.test(line)) hasRate = true
    if (/^\s*\|/.test(line)) {
      if (!SEPARATOR_RE.test(line)) table.push({ cells: line.trim().replace(/^\||\|$/g, "").split("|"), line: no, raw: line })
      // 표 칸 속 산출근거도 검산
      checkCalc(line, no, out)
      continue
    }
    flush()
    checkCalc(line, no, out)
    SYMBOL_RE.lastIndex = 0
    for (const m of line.matchAll(SYMBOL_RE)) {
      if (out.length >= MAX_FINDINGS) break
      out.push({ line: no, column: (m.index ?? 0) + 1, match: m[0].trim(), rule: "BUDGET_CURRENCY_SYMBOL", severity: "warning",
        message: "공문서는 $·USD 대신 '달러'로 쓰고 원화를 먼저", suggest: "예) 약 4,200원(약 3.1달러)" })
    }
    DOLLAR_RE.lastIndex = 0
    // 줄마다 원화 유무는 한 번, 괄호 깊이는 앞 매치 자리부터 이어 센다 — 매치마다 줄을 다시 훑지 않게
    let hasWon: boolean | undefined
    let depth = 0, scanned = 0
    for (const m of line.matchAll(DOLLAR_RE)) {
      dollarLine ||= no
      if (out.length >= MAX_FINDINGS) break
      for (const at = m.index ?? 0; scanned < at; scanned++) {
        const ch = line[scanned]
        if (ch === "(" || ch === "（") depth++
        else if ((ch === ")" || ch === "）") && depth > 0) depth--
      }
      if (depth > 0 || (hasWon ??= WON_RE.test(line))) continue
      out.push({ line: no, column: (m.index ?? 0) + 1, match: m[0], rule: "BUDGET_WON_FIRST", severity: "warning",
        message: "외화 금액은 원화를 앞에 쓰고 외화는 괄호로", suggest: `약 ○○원(${m[0]})` })
    }
    const b = line.match(BASIS_RE)
    if (b && WON_RE.test(line) && !BASIS_NAMED_RE.test(line)) {
      out.push({ line: no, column: (b.index ?? 0) + 1, match: b[0], rule: "BUDGET_BASIS_UNCLEAR", severity: "warning",
        message: "증감 기준이 본예산인지 최종예산(추경 포함)인지 밝히기", suggest: "예) 2026년 본예산 대비 1,200천원 증" })
    }
  }
  flush()
  if (dollarLine && !hasRate) {
    out.push({ line: dollarLine, match: "달러", rule: "BUDGET_RATE_MISSING", severity: "warning",
      message: "달러 금액이 있는데 원화 환산 환율 기준이 없음", suggest: "예) ※ 환율 1,330원/달러('26. 10. 20. 기준)" })
  }
  out.sort((a, b) => a.line - b.line || (a.column ?? 0) - (b.column ?? 0))
  return out.length > MAX_FINDINGS ? out.slice(0, MAX_FINDINGS) : out
}
