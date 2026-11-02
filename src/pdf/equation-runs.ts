/**
 * 한컴 수식 글꼴(HyhwpEQ) 글 → `$…$` 수식 스팬.
 *
 * 한컴 PDF 는 수식을 수식 글꼴 글자로 찍는데, 숫자·변수·연산자가 사용자 영역(U+E0xx) 전용 코드라 종전엔 뒤 단계가 지워
 * "함수 의 극댓값이", "① ② ③"(선택지 숫자 소실)이 됐다. 수식 글꼴 글자를 가까운 것끼리 묶고, 코드를 되살리고(수능
 * 모의고사 PDF 4종을 한컴 수식 script·쪽 그림과 대조한 표), 분수 막대(U+E06D) 위·아래 글을 \frac{}{}, 올라간 글을 ^{} 로
 * 조립해 `$…$` 로 감싼다 — HWPX·HWP5 경로가 같은 수식을 `$…$` 로 내는 것과 같은 모양. 표에 없는 코드는 버린다(종전과 같음).
 * 리터럴 `$` 이스케이프(escapeLiteralDollar) 뒤에 불러야 스팬 기호가 살아남는다.
 */

import type { NormItem } from "./text-line.js"
import { toTex } from "../table/layout-frames.js"

/** 한컴 수식 글꼴 실명 (서브셋 접두 뗀 이름) */
const EQ_FONT_RE = /^(?:Hy)?hwpEQ/i
/** 분수 막대 */
const BAR = 0x6d

/** 그리스 소문자 — U+E09D 부터 α β γ … (θ=E0A4·π=E0AC·σ=E0AE 로 순서 확인) */
const GREEK = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "o", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"]
/** 수식 글꼴 안의 일반 유니코드 기호 → LaTeX */
const PLAIN: Record<string, string> = {
  "→": "\\to ", "≤": "\\le ", "≥": "\\ge ", "×": "\\times ", "·": "\\cdot ", "⋅": "\\cdot ", "∙": "\\cdot ", "∞": "\\infty ",
  "−": "-", "⋯": "\\cdots ", "∠": "\\angle ", "∴": "\\therefore ", "∵": "\\because ", "∩": "\\cap ", "∪": "\\cup ",
  "≠": "\\ne ", "°": "^{\\circ}", "⊥": "\\perp ", "∏": "\\prod ", "±": "\\pm ", "∉": "\\notin ", "⊂": "\\subset ", "⇒": "\\Rightarrow ",
}
/** 기호 코드 (U+E000 + 코드) — 수능 모의고사 PDF 4종 문맥과 한컴 수식 script 로 확인한 것만 */
const SYMBOLS: Record<number, string> = {
  0x44: "(", 0x45: ")", 0x46: "-", 0x47: "=", 0x48: "+", 0x49: "[", 0x4a: "]", 0x4b: "\\{", 0x4c: "\\}", 0x4d: "|", 0x4f: ":",
  0x52: ",", 0x53: ".", 0x55: "<", 0x56: ">", 0x5b: "\\int ", 0x5c: "\\sqrt", 0x67: "\\sum ",
}

/** U+E000 + 코드 → 글 (확인한 것만 — 여러 줄 괄호 조각·벡터 화살표 등은 버린다) */
function decodeEq(ch: string): string {
  const cp = ch.codePointAt(0)!
  if (cp < 0xe000 || cp > 0xe0ff) return PLAIN[ch] ?? ch
  const c = cp - 0xe000
  if (c <= 0x19) return String.fromCharCode(0x41 + c) // 이탤릭 A~Z (S_n·X·Y 확인)
  if (c >= 0x34 && c <= 0x3c) return String(c - 0x33) // 1~9
  if (c === 0x3d) return "0"
  if (c >= 0xe5 && c <= 0xfe) return String.fromCharCode(0x61 + c - 0xe5) // 이탤릭 a~z
  if (c >= 0x9d && c < 0x9d + GREEK.length) return `\\${GREEK[c - 0x9d]} `
  return SYMBOLS[c] ?? ""
}

/** 수식 안 로마자 함수 이름 — 한컴은 똑바로 선 글자(ASCII)로 찍는다 */
const FUNC_RE = /^(lim|sin|cos|tan|log|ln|exp|max|min)$/

interface Tok { text: string; x: number; y: number; w: number; size: number; bar: boolean }

/** 묶음 안 조각 → LaTeX 에 가까운 글. 짧은 막대부터(안쪽 분수 먼저) 위·아래 조각을 분수로, 올라간 작은 조각은 위첨자로 */
function layout(toks: Tok[]): string {
  let rest = toks.filter(t => t.bar || t.text.trim())
  // 근호 — √ 바로 오른쪽에서 시작하는 막대가 윗줄, 그 아래 글이 근호 안
  for (const rt of rest.filter(t => t.text === "\\sqrt").sort((a, b) => b.x - a.x)) {
    const size = Math.max(rt.size, 1)
    const bar = rest.find(t => t.bar && t.x >= rt.x && t.x <= rt.x + rt.w + 2 && Math.abs(t.y - rt.y) <= size * 1.5)
    if (!bar) continue
    const inner = rest.filter(t => !t.bar && t !== rt && t.x + t.w / 2 > bar.x && t.x + t.w / 2 < bar.x + bar.w && bar.y - t.y > 0 && bar.y - t.y <= size * 1.4)
    const tok: Tok = { text: `\\sqrt{${linear(inner)}}`, x: rt.x, w: bar.x + bar.w - rt.x, y: inner[0]?.y ?? rt.y, size: Math.max(rt.size, ...inner.map(t => t.size)), bar: false }
    rest = [...rest.filter(t => t !== rt && t !== bar && !inner.includes(t)), tok]
  }
  const bars = rest.filter(t => t.bar).sort((a, b) => a.w - b.w)
  for (const bar of bars) {
    const inX = (t: Tok) => t !== bar && t.x + t.w / 2 >= bar.x - 1 && t.x + t.w / 2 <= bar.x + bar.w + 1
    const num = rest.filter(t => inX(t) && t.y > bar.y), den = rest.filter(t => inX(t) && t.y < bar.y)
    if (!num.length || !den.length) continue
    const fsize = Math.max(...num.map(t => t.size), ...den.map(t => t.size))
    const frac: Tok = { text: `\\frac{${linear(num)}}{${linear(den)}}`, x: bar.x, w: bar.w, y: Math.round(bar.y + fsize * 0.3), size: fsize, bar: false }
    rest = [...rest.filter(t => t !== bar && !num.includes(t) && !den.includes(t)), frac]
  }
  return linear(rest.filter(t => !t.bar))
}

/** 한 줄로 — x 순, 기준선보다 확실히 올라간 작은 조각은 ^{}, 내려간 작은 조각은 _{} */
function linear(toks: Tok[]): string {
  const sorted = [...toks].sort((a, b) => a.x - b.x)
  if (!sorted.length) return ""
  const size = Math.max(...sorted.map(t => t.size))
  const base = sorted.find(t => t.size === size)!.y
  let out = "", scr = "", kind = ""
  const flushScr = () => { if (scr) { out += `${kind}{${scr.trim()}}`; scr = ""; kind = "" } }
  for (const t of sorted) {
    const small = t.size < size * 0.9
    const k = small && t.y > base + size * 0.2 ? "^" : (small && t.y < base - size * 0.1) || t.y < base - size * 0.3 ? "_" : ""
    if (k) { if (kind && kind !== k) flushScr(); kind = k; scr += t.text; continue }
    flushScr()
    out += (FUNC_RE.test(t.text) ? `\\${t.text} ` : t.text)
  }
  flushScr()
  return out.replace(/\s+/g, " ").trim()
}

const isBarItem = (it: NormItem) => it.text.length === 1 && it.text.codePointAt(0) === 0xe000 + BAR

/** 조각 글자 크기 — 분수 막대는 가로로 늘려 찍어 글자 크기가 막대 길이만큼 커진다(47pt 막대 → 95). 크기 판단에서 뺀다 */
const sizeOf = (it: NormItem) => (isBarItem(it) ? 0 : it.fontSize)

/** 두 수식 조각이 한 수식인가 — 같은 줄(첨자 포함)로 붙어 있거나, 분수 막대 위·아래에 놓였다 */
function near(a: NormItem, b: NormItem): boolean {
  const size = Math.max(sizeOf(a), sizeOf(b), 1)
  const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)
  const dy = Math.abs(a.y - b.y)
  if (gap <= size * 0.8 && dy <= size * 0.6) return true
  // 분수 막대 — 막대 폭 안에 가운데가 놓이고 막대 바로 위·아래(글자 크기 1.2배 안)인 조각만 분자·분모
  for (const [bar, o] of [[a, b], [b, a]] as const) {
    if (!isBarItem(bar) || isBarItem(o)) continue
    const cx = o.x + o.w / 2
    if (cx > bar.x && cx < bar.x + bar.w && dy > 0 && dy <= size * 1.2) return true
  }
  return false
}

export function wrapEquationRuns(items: NormItem[], faceName: (fontName: string) => string | undefined): number {
  const eqIdx: number[] = []
  items.forEach((it, i) => { if (it.text.trim() && EQ_FONT_RE.test(faceName(it.fontName) ?? "")) eqIdx.push(i) })
  if (!eqIdx.length) return 0
  // 분수 막대 바로 위·아래의 본문 글꼴 글도 분자·분모 — 한글 분자·분모는 본문 글꼴로 찍는다(대기환경보전법 시행령 [별표 8]
  // "배출농도 / 배출허용기준농도": 수식 글꼴은 막대 하나뿐이라 종전엔 막대만 버리고 분자를 앞 문단으로 냈다)
  const overBar = (bar: NormItem, it: NormItem): boolean => {
    const cx = it.x + it.w / 2, dy = Math.abs(it.y - bar.y)
    return cx > bar.x && cx < bar.x + bar.w && dy > 0 && dy <= Math.max(it.fontSize, 1) * 1.2
  }
  // 수식 글꼴 분자·분모가 하나도 없는 막대만 — 수식 글꼴로 찍은 분수(수능 모의고사) 둘레의 본문 글("위의")을 끌어들이지 않게
  const barItems = eqIdx.map(i => items[i]).filter(bar => isBarItem(bar) && !eqIdx.some(j => !isBarItem(items[j]) && overBar(bar, items[j])))
  const plain = new Set<number>()
  if (barItems.length) {
    items.forEach((it, i) => {
      if (!it.text.trim() || EQ_FONT_RE.test(faceName(it.fontName) ?? "")) return
      // 막대 폭 안에 가운데가 놓이고 막대 위·아래(글자 크기 1.2배 안)인 것만 — 막대 옆에 이어 쓴 글("이고")은 수식 밖
      if (barItems.some(bar => overBar(bar, it))) plain.add(i)
    })
    if (plain.size) eqIdx.push(...plain)
    eqIdx.sort((a, b) => a - b)
  }
  // 근접 union-find — 목록은 줄 정렬이라 분자·분모·첨자가 멀리 떨어져 들어온다
  const parent = eqIdx.map((_, k) => k)
  const find = (k: number): number => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k] } return k }
  for (let a = 0; a < eqIdx.length; a++) {
    for (let b = a + 1; b < eqIdx.length; b++) {
      const A = items[eqIdx[a]], B = items[eqIdx[b]]
      if (A.y - B.y > Math.max(sizeOf(A), sizeOf(B), 12) * 3) break // y 내림차순 — 멀리 내려가면 그만
      if (near(A, B)) parent[find(a)] = find(b)
    }
  }
  const clusters = new Map<number, number[]>()
  eqIdx.forEach((idx, k) => { const r = find(k); const arr = clusters.get(r); if (arr) arr.push(idx); else clusters.set(r, [idx]) })
  const drop = new Set<number>()
  const added: NormItem[] = []
  for (const members of clusters.values()) {
    const cur = members.map(i => items[i])
    for (const i of members) drop.add(i)
    const toks: Tok[] = cur.map(it => {
      const bar = isBarItem(it)
      const text = bar ? "" : plain.has(items.indexOf(it)) ? toTex(it.text) : FUNC_RE.test(it.text.trim()) ? it.text.trim() : [...it.text].map(decodeEq).join("")
      return { text, x: it.x, y: it.y, w: it.w, size: sizeOf(it), bar }
    })
    // 글자마다 찍은 본문 글꼴 분자·분모는 \text{} 조각이 이어진다 — 한 덩어리로
    const tex = layout(toks).replace(/\}\\text\{/g, "")
    if (!tex) continue // 되살릴 글이 없는 조각(표에 없는 코드) — 종전처럼 버린다
    // 줄 위치 — 본문 크기 조각이 가장 많이 놓인 기준선. 분수뿐인 덩어리는 막대 높이(분자·분모 가운데)에 둔다
    const size = Math.max(...cur.map(sizeOf))
    const mains = cur.filter(i => !isBarItem(i) && i.fontSize === size)
    const ys = new Map<number, number>()
    for (const i of mains) ys.set(i.y, (ys.get(i.y) ?? 0) + 1)
    const top = [...ys].sort((p, q) => q[1] - p[1])
    const bar = cur.find(isBarItem)
    const lineY = bar && top.length > 1 && top[0][1] === top[1][1] ? Math.round(bar.y + size * 0.3) : top[0]?.[0] ?? cur[0].y
    const base = { ...(mains[0] ?? cur[0]), y: lineY, fontSize: size || cur[0].fontSize }
    const x1 = Math.min(...cur.map(i => i.x)), x2 = Math.max(...cur.map(i => i.x + i.w))
    added.push({ ...base, text: `$${tex}$`, x: x1, w: x2 - x1, hasSpaceBefore: true })
  }
  const kept = items.filter((_, i) => !drop.has(i))
  items.length = 0
  items.push(...kept, ...added)
  items.sort((a, b) => b.y - a.y || a.x - b.x)
  return added.length
}
