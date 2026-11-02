/** 단일 문단의 실제 줄바꿈은 보존하고 각 줄의 변경 범위만 치환한다. */
import { decodeXmlEntities, escapeXmlText, type ScanParagraph, type SpliceEdit } from "./source-map.js"
import { sanitizeText } from "./markdown-units.js"

export function buildEmbeddedLineSplices(para: ScanParagraph, xml: string, newLines: string[]): SpliceEdit[] | null {
  const tokens: { from: number; to: number; start: number; end: number }[] = []
  let text = ""
  for (const range of para.tRanges) {
    if (range.selfClosing) continue
    const raw = xml.slice(range.contentStart, range.contentEnd)
    // 내부 태그는 텍스트 좌표와 다르다. 알려진 엔티티만 좌표를 디코딩한다.
    if (raw.includes("<")) return null
    const base = text.length
    let cursor = 0
    for (const match of raw.matchAll(/&(?:lt|gt|amp|quot|apos|#(?:[0-9]+|x[0-9a-fA-F]+));|[^&]/gu)) {
      const decoded = decodeXmlEntities(match[0])
      if (match.index !== cursor || (decoded === match[0] && match[0].startsWith("&"))) return null
      cursor += match[0].length
      tokens.push({ from: text.length, to: text.length + decoded.length,
        start: range.contentStart + match.index!, end: range.contentStart + match.index! + match[0].length })
      text += decoded
    }
    // 알 수 없는 엔티티/누락된 & 문자가 있으면 디코딩 좌표를 신뢰하지 않는다.
    if (cursor !== raw.length || decodeXmlEntities(raw) !== text.slice(base)) return null
  }
  if (text !== para.text || !/[\r\n]/.test(text) || /<br\s*\/?\s*>/i.test(text)) return null
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.length !== newLines.length || lines.some(line => !line.trim() || sanitizeText(line) !== line.trim())) return null
  const splices: SpliceEdit[] = []
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const orig = line.trim()
    const next = newLines[i]
    if (sanitizeText(next) !== next || /[\r\n]/.test(next) || /[\uD800-\uDFFF]/u.test(next)
      || decodeXmlEntities(escapeXmlText(next)) !== next) return null
    let prefix = 0
    while (prefix < orig.length && prefix < next.length && orig[prefix] === next[prefix]) prefix++
    if (prefix > 0 && /[\uD800-\uDBFF]/.test(orig[prefix - 1]) && /[\uDC00-\uDFFF]/.test(orig[prefix] ?? "")) prefix--
    let suffix = 0
    while (suffix < orig.length - prefix && suffix < next.length - prefix
      && orig[orig.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++
    if (suffix > 0 && /[\uDC00-\uDFFF]/.test(orig[orig.length - suffix])
      && /[\uD800-\uDBFF]/.test(orig[orig.length - suffix - 1] ?? "")) suffix--
    if (orig !== next) {
      const start = offset + line.length - line.trimStart().length + prefix
      const end = offset + line.length - line.trimStart().length + orig.length - suffix
      const replacement = escapeXmlText(next.slice(prefix, next.length - suffix))
      // 엔티티 하나나 서로게이트 쌍의 중간에 걸리는 편집 경계는 거부한다.
      if (tokens.some(t => (t.from < start && start < t.to) || (t.from < end && end < t.to))) return null
      if (start === end) {
        const token = tokens.find(t => t.from === start) ?? tokens.find(t => t.to === start)
        if (!token) return null
        const at = token.from === start ? token.start : token.end
        splices.push({ start: at, end: at, replacement })
      } else {
        let placed = false
        for (const token of tokens) {
          if (token.to <= start || token.from >= end) continue
          const previous = splices[splices.length - 1]
          if (placed && previous.end === token.start) previous.end = token.end
          else splices.push({ start: token.start, end: token.end, replacement: placed ? "" : replacement })
          placed = true
        }
        if (!placed) return null
      }
    }
    offset += line.length
    offset += text.slice(offset).match(/^(?:\r\n|\r|\n)/)?.[0].length ?? 0
  }
  return splices
}
