import { toInt32 } from "./layout.js"

/** 저장 문단의 마지막 쪽·단 바닥. 같은 높이의 줄 조각은 가장 낮은 바닥을 유지한다. */
export function cachedParagraphBottom(lsa: Element, bodyFlow: boolean): number {
  let bottom = Number.NEGATIVE_INFINITY, previousV = Number.NEGATIVE_INFINITY
  for (let i = 0; i < lsa.childNodes.length; i++) {
    const seg = lsa.childNodes[i] as Element
    if (seg.nodeType !== 1 || seg.localName !== "lineseg") continue
    const num = (name: string, fallback = 0) => toInt32(seg.getAttribute(name) ?? undefined, fallback)
    const v = num("vertpos")
    if (bodyFlow && v < previousV) bottom = Number.NEGATIVE_INFINITY
    bottom = Math.max(bottom, v + Math.max(num("vertsize", 1000), num("textheight", 1000)) + num("spacing"))
    previousV = v
  }
  return bottom
}
