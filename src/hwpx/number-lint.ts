/**
 * 본문 수치 ↔ 표 수치 대조 (`kordoc lint --numbers`) — 표를 소개·요약하는 본문이 표와 다른 숫자를 쓰지 않았는지 1차로 본다.
 * 오류 판정이 아니라 사람이 확인할 목록이다. 문서의 모든 수치를 대조하면 서술용 수치가 쏟아지므로 범위를 좁힌다:
 *  - 대상: 숫자가 TABLE_MIN_NUMBERS 개 이상인 표의 앞뒤 NEAR_BLOCKS 블록 안 본문, 그 표들 가운데 하나라도 같은 단위를 쓰는 수치
 *  - 표의 단위: 칸 숫자에 붙은 단위("4대", "218억원"), 또는 칸·머리글의 단위 표기("(억원)", "단위: 억원") — 단위 표기가 있으면
 *    그 표의 모든 숫자를 그 단위 값으로 본다
 *  - 빼는 것: 기준·목표값("30명 이상", "목표 20명", "약 3억원"), 날짜·차수·순번처럼 단위 목록에 없는 수
 *  - 찾기: 앞뒤 FIND_BLOCKS 블록의 표에서 같은 단위·같은 값. 소수이거나 세 자리 이상인 값은 단위 없는 칸("(25.7)")과도 맞춰 본다 —
 *    "11"처럼 흔한 수는 행 번호와 우연히 겹치므로 단위가 맞아야 한다
 */

/** 대조 입력 블록 — 표는 칸 글 행렬, 그 밖은 글 */
export interface NumberCheckBlock {
  type: "table" | "text"
  text?: string
  rows?: string[][]
}

export interface NumberReview {
  /** 걸린 본문 수치 ("218억원") */
  match: string
  /** 그 수치가 든 본문 (앞 80자) */
  context: string
}

const TABLE_MIN_NUMBERS = 5
const NEAR_BLOCKS = 3
const FIND_BLOCKS = 10

/** 대조하는 단위 — 표기 → 정규형. 금액·비율·개수·면적·무게·거리만(날짜·차수·순번·횟수는 표 밖 서술에 흔해 빼 둔다) */
const UNITS: ReadonlyArray<readonly [string, string]> = [
  ["조원", "조원"], ["억원", "억원"], ["천만원", "천만원"], ["백만원", "백만원"], ["만원", "만원"], ["천원", "천원"], ["원", "원"],
  ["%p", "%p"], ["％p", "%p"], ["%", "%"], ["％", "%"],
  ["명", "명"], ["건", "건"], ["개소", "개소"], ["곳", "곳"], ["대", "대"], ["가구", "가구"], ["세대", "세대"],
  ["톤", "톤"], ["㎡", "㎡"], ["㎢", "㎢"], ["km", "km"], ["㎞", "km"],
]
// 금액 단위는 "억 원"처럼 띄어 써도 같은 단위 — 표기 사이 공백을 하나까지 허용한다
const unitPattern = UNITS.map(([u]) => u.replace(/^([조억만천백]+)(원)$/, "$1\\s?$2")).join("|")
const canonicalUnit = (raw: string): string => {
  const squeezed = raw.replace(/\s+/g, "")
  return UNITS.find(([u]) => u === squeezed)?.[1] ?? squeezed
}

/** 수 — 세 자리 쉼표 묶음이거나 그냥 숫자, 소수 허용 */
const NUMBER_SRC = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`
/** 단위 뒤에 붙어도 단위로 보는 조사 — 그 밖의 글자가 이어지면 "대부분"의 "대"처럼 낱말의 일부다 */
const AFTER_UNIT = ["으로", "에서", "까지", "부터", "보다", "이며", "이고", "은", "는", "이", "가", "을", "를", "의", "에", "로", "과", "와", "도", "만", "씩"]
const QUANTITY_RE = new RegExp(
  String.raw`(?<![\d.,])(${NUMBER_SRC})\s?(${unitPattern})(?=$|[^가-힣A-Za-z]|(?:${AFTER_UNIT.join("|")})(?![가-힣A-Za-z]))`, "g")
const BARE_RE = new RegExp(String.raw`(?<![\d.])(${NUMBER_SRC})`, "g")
/** 표 전체에 걸린 단위 표기 — "(억원)", "(단위: 억원)", "단위: 명" */
const UNIT_NOTE_RE = new RegExp(String.raw`[(（]\s*(?:단위\s*[:：]\s*)?(${unitPattern})\s*[)）]|단위\s*[:：]\s*(${unitPattern})`, "g")

/** 수치 바로 뒤 기준 표현 */
const BOUND_AFTER = /^\s?(?:이상|이하|초과|미만|내외|수준|안팎|가량|정도)/
/** 수치 앞 12자 안의 기준·목표 표현 */
const BOUND_BEFORE = /(?:목표|기준|상한|하한|최소|최대|약)[^\d]{0,8}$/

/** 값 비교용 — 쉼표와 소수 끝 0 을 지운다("1,234.50" → "1234.5") */
function canonicalValue(text: string): string {
  const plain = text.replace(/,/g, "")
  if (!plain.includes(".")) return plain
  return plain.replace(/0+$/, "").replace(/\.$/, "")
}

/** 행 번호와 우연히 겹치기 어려운 값 — 소수이거나 세 자리 이상 */
const isDistinctive = (value: string): boolean => value.includes(".") || value.replace(/^0+/, "").length >= 3

interface TableIndex {
  at: number
  /** 단위 → 그 단위로 볼 수 있는 값들 */
  valuesByUnit: Map<string, Set<string>>
  /** 표에 적힌 모든 수(단위 무관) */
  bare: Set<string>
}

function indexTable(rows: string[][], at: number): TableIndex | null {
  const cells = rows.flat().map((c) => c ?? "")
  const bare = new Set<string>()
  for (const cell of cells) for (const m of cell.matchAll(BARE_RE)) bare.add(canonicalValue(m[1]))
  if (bare.size < TABLE_MIN_NUMBERS) return null
  const valuesByUnit = new Map<string, Set<string>>()
  const bucket = (unit: string): Set<string> => {
    let set = valuesByUnit.get(unit)
    if (!set) valuesByUnit.set(unit, (set = new Set()))
    return set
  }
  for (const cell of cells) {
    for (const m of cell.matchAll(QUANTITY_RE)) bucket(canonicalUnit(m[2])).add(canonicalValue(m[1]))
    for (const m of cell.matchAll(UNIT_NOTE_RE)) {
      const set = bucket(canonicalUnit(m[1] ?? m[2]))
      for (const v of bare) set.add(v)
    }
  }
  return { at, valuesByUnit, bare }
}

/** 표 가까이의 본문 수치 가운데 그 표에서 찾지 못한 것 */
export function checkTableNumbers(blocks: NumberCheckBlock[]): { checked: number; review: NumberReview[] } {
  const tables: TableIndex[] = []
  blocks.forEach((b, i) => {
    if (b.type !== "table" || !b.rows) return
    const index = indexTable(b.rows, i)
    if (index) tables.push(index)
  })
  let checked = 0
  const review: NumberReview[] = []
  blocks.forEach((b, i) => {
    if (b.type !== "text" || !b.text) return
    const text = b.text
    const neighbours = tables.filter((t) => Math.abs(t.at - i) <= NEAR_BLOCKS)
    if (neighbours.length === 0) return
    const searchable = tables.filter((t) => Math.abs(t.at - i) <= FIND_BLOCKS)
    const done = new Set<string>()
    for (const m of text.matchAll(QUANTITY_RE)) {
      const start = m.index ?? 0
      const end = start + m[0].length
      if (BOUND_AFTER.test(text.slice(end)) || BOUND_BEFORE.test(text.slice(Math.max(0, start - 12), start))) continue
      const unit = canonicalUnit(m[2])
      const value = canonicalValue(m[1])
      const key = `${value}${unit}`
      if (done.has(key)) continue
      done.add(key)
      if (!neighbours.some((t) => t.valuesByUnit.has(unit))) continue
      checked++
      const distinctive = isDistinctive(value)
      const found = searchable.some((t) => t.valuesByUnit.get(unit)?.has(value) || (distinctive && t.bare.has(value)))
      if (!found) review.push({ match: `${m[1]}${m[2]}`, context: text.replace(/\s+/g, " ").trim().slice(0, 80) })
    }
  })
  return { checked, review }
}

/** 파싱한 문서 IR → 대조 블록 (표는 칸 글, 문단·제목·목록은 글. 칸 안 표는 겉 표 칸 글로만 본다) */
export function numberBlocksFromIR(blocks: Array<{ type: string; text?: string; table?: { cells: Array<Array<{ text: string } | undefined>> } }>): NumberCheckBlock[] {
  return blocks.flatMap((b): NumberCheckBlock[] => {
    if (b.type === "table" && b.table) return [{ type: "table", rows: b.table.cells.map((row) => row.map((c) => c?.text ?? "")) }]
    return b.text ? [{ type: "text", text: b.text }] : []
  })
}

/** 마크다운 원고 블록 → 대조 블록 */
export function numberBlocksFromMarkdown(blocks: Array<{ type: string; text?: string; rows?: string[][] }>): NumberCheckBlock[] {
  return blocks.flatMap((b): NumberCheckBlock[] => {
    if (b.type === "table" && b.rows) return [{ type: "table", rows: b.rows }]
    return b.text ? [{ type: "text", text: b.text }] : []
  })
}
