/**
 * 작성 PC 글꼴 환경 추정 — KoPub 글꼴 항목에 대체 글꼴(substFont)이 적힌 문서는 KoPub 이 없는 PC 에서 그 대체 글꼴로 조판·인쇄됐을
 * 수 있다(같은 판 한컴 PDF 가 KoPub 자리를 Haansoft Batang 으로 찍고, 저장 줄 나눔도 그 폭이다). 렌더는 저장 줄 나눔을 그대로 쓰므로
 * 그 줄 나눔으로 환경을 가린다 — 구역을 두 글꼴 폭으로 각각 다시 꺾어 저장 줄 시작과 같은 문단이 더 많은 쪽.
 * 조판(reflow) 자체는 선언 글꼴 그대로다(저장 줄로 고른 폭을 다시 저장 줄과 견주면 순환이다).
 */

import { createXmlParser } from "../hwpx/parser-shared.js"
import { reflowSection } from "./reflow.js"
import { elements, ln, num } from "./para-model.js"
import type { RenderStyles } from "./head-styles.js"

/** KoPub TTF 글꼴 항목에 대체 글꼴이 적혀 있는가 */
export function hasKoPubSubst(headXml: string): boolean {
  return /<hh:font\b[^>]*\bface="KoPub[^"]*"[^>]*\btype="TTF"[^>]*>\s*<hh:substFont\b/.test(headXml)
}

/** 문단마다 저장 줄 시작(두 줄 이상 문단만) — 문서 순서 */
function lineStarts(root: Element): Array<string | null> {
  const out: Array<string | null> = []
  for (const p of Array.from(root.getElementsByTagName("hp:p")) as unknown as Element[]) {
    const lsa = elements(p).find(e => ln(e) === "linesegarray")
    const segs = lsa ? elements(lsa).filter(e => ln(e) === "lineseg") : []
    out.push(segs.length >= 2 ? segs.map(s => s.getAttribute("textpos") ?? "0").join(",") : null)
  }
  return out
}

/** 구역을 styles 폭으로 다시 꺾은 뒤 저장 줄 시작과 같은 두 줄+ 문단 수 */
function matchCount(xml: string, saved: Array<string | null>, styles: RenderStyles): number {
  const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
  const pagePr = root.getElementsByTagName("hp:pagePr")[0] as unknown as Element | undefined
  if (!pagePr) return 0
  const margin = pagePr.getElementsByTagName("hp:margin")[0] as unknown as Element | undefined
  let PW = num(pagePr, "width", 59528), PH = num(pagePr, "height", 84188)
  if (pagePr.getAttribute("landscape") === "NARROWLY" && PW < PH) [PW, PH] = [PH, PW]
  const gutterTB = pagePr.getAttribute("gutterType") === "TOP_BOTTOM", gutter = num(margin ?? null, "gutter", 0)
  const BODY_W = PW - num(margin ?? null, "left", 8504) - num(margin ?? null, "right", 8504) - (gutterTB ? 0 : gutter)
  const BODY_H = PH - num(margin ?? null, "top", 5668) - num(margin ?? null, "header", 0) - num(margin ?? null, "bottom", 4252) - num(margin ?? null, "footer", 0) - (gutterTB ? gutter : 0)
  // 저장 줄을 지우고 다시 꺾는다(남겨 두면 조판이 저장 줄을 그대로 쓴다)
  for (const p of Array.from(root.getElementsByTagName("hp:p")) as unknown as Element[]) {
    const lsa = elements(p).find(e => ln(e) === "linesegarray")
    if (lsa) p.removeChild(lsa)
  }
  reflowSection(root, styles, { BODY_W, BODY_H })
  const got = lineStarts(root)
  let n = 0
  saved.forEach((s, i) => { if (s !== null && s === got[i]) n++ })
  return n
}

/** 대체 글꼴 폭(alt)이 선언 글꼴 폭(base)보다 저장 줄 나눔을 뚜렷이 더 많이 맞히면 true */
export function kopubSubstituted(secXmls: string[], base: RenderStyles, alt: RenderStyles): boolean {
  // 두 줄+ 문단 60개쯤이면 갈린다 — 큰 문서를 통째로 두 번 다시 꺾지 않게 앞 구역부터 그만큼만
  let a = 0, b = 0, seen = 0
  for (const xml of secXmls) {
    const saved = lineStarts(createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element)
    a += matchCount(xml, saved, base)
    b += matchCount(xml, saved, alt)
    seen += saved.filter(x => x !== null).length
    if (seen >= 60) break
  }
  // 뚜렷할 때만 — 두 폭의 차가 몇 문단뿐이면 줄 나눔이 글꼴 말고 다른 까닭으로 갈린 것이다
  return b >= a + 5 && b > a * 1.1
}
