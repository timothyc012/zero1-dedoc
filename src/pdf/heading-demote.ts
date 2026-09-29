/**
 * PDF 헤딩 강등 — 승격 패스들이 끝난 뒤, 제목이 될 수 없는 역할의 줄을 본문으로 되돌린다.
 *
 * 승격 패스는 글꼴 크기·서체 차이만 보므로 쪽 머리말·꼬리말, 캡션, 번호 붙은 수식 줄,
 * 문장 중간에서 끊긴 줄도 올린다. 여기서는 문자열 정답이 아니라 역할 증거(쪽 가장자리 띠와
 * 쪽번호, 캡션 표지, 수식 번호·관계 기호, 소문자로 시작하는 이어진 문장)로만 판단한다.
 */

import type { IRBlock } from "../types.js"
import { TOC_BLOCKS } from "./table-roles.js"

const PAGE_NUMBER = /^(?:\d{1,4}|[ivxlc]{1,7})$/i
const CAPTION = /^(?:Table|Figure|Fig\.?)\s*\d+(?:\.\d+)*\s*[.:]/i
const EQUATION_NUMBER = /\t\(\d{1,3}[a-z]?\)\s*$/
/** 별행 수식 — 관계 기호·근호·큰 연산자가 든 줄은 절 제목이 아니다 (#89 "MultiHead(Q, K, V) = Concat(…)") */
const DISPLAY_MATH = /=|[√∑∏∫∂∇≤≥≈≠∈∀∃]/

/**
 * Resolve first-page title roles after the typography passes. A short masthead
 * can use the same face and size as the document title; later sections often
 * reuse that face at a smaller size. The relationship between these blocks is
 * stronger evidence than the absolute font size alone.
 */
export function refineLeadDocumentTitleRoles(blocks: IRBlock[], pageHeights: Map<number, number>): void {
  // Same-baseline title fragments can be separate PDF text objects even when
  // they form one printed line (for example a bold phrase followed by "für …").
  for (let i = 0; i + 1 < blocks.length; i++) {
    const title = blocks[i], next = blocks[i + 1]
    const size = title.style?.fontSize ?? 0
    if (title.type !== "heading" || title.level !== 1 || title.pageNumber !== 1 || size < 14 ||
        (next.type !== "paragraph" && next.type !== "heading") || next.pageNumber !== 1 || !title.bbox || !next.bbox || !next.text ||
        next.style?.fontName !== title.style?.fontName || Math.abs((next.style?.fontSize ?? 0) - size) > 0.5 ||
        Math.abs(next.bbox.y - title.bbox.y) > 2 || !/^[a-zäöüß]/.test(next.text.trim()) ||
        next.text.trim().length > 40) continue
    const gap = next.bbox.x - (title.bbox.x + title.bbox.width)
    if (gap < -1 || gap > size * 0.75) continue
    title.text = `${title.text?.trim()} ${next.text.trim()}`
    title.bbox = { ...title.bbox, width: next.bbox.x + next.bbox.width - title.bbox.x,
      height: Math.max(title.bbox.height, next.bbox.height) }
    blocks.splice(i + 1, 1)
  }

  const firstIndex = blocks.findIndex(block => block.pageNumber === 1 && block.type === "heading" && block.level === 1)
  if (firstIndex < 0) return
  const secondIndex = blocks.findIndex((block, index) => index > firstIndex && block.pageNumber === 1 && block.type === "heading" && block.level === 1)
  if (secondIndex < 0) return
  const first = blocks[firstIndex], title = blocks[secondIndex]
  const pageHeight = pageHeights.get(1)
  const firstSize = first.style?.fontSize ?? 0, titleSize = title.style?.fontSize ?? 0
  const between = blocks.slice(firstIndex + 1, secondIndex)
  const letters = first.text?.match(/\p{L}/gu)?.join("") ?? ""
  const wordmark = !!first.bbox && !!title.bbox && letters.length >= 8 && letters === letters.toUpperCase() &&
    first.text!.trim().split(/\s+/).length >= 2 && firstSize >= 8 && firstSize <= titleSize * 0.8 &&
    first.bbox.x > title.bbox.x + title.bbox.width * 0.2
  const masthead = firstSize >= 12 && titleSize >= firstSize * 0.85 && titleSize <= firstSize * 1.2
  if (!first.text || !title.text || !first.bbox || !title.bbox || !pageHeight || titleSize < 12 ||
      (!masthead && !wordmark) ||
      /\d/.test(first.text) ||
      first.text.trim().length > 32 || title.text.trim().length < first.text.trim().length * 1.2 ||
      first.bbox.y + first.bbox.height < pageHeight * 0.7 ||
      first.bbox.y <= title.bbox.y + title.bbox.height ||
      first.bbox.y - (title.bbox.y + title.bbox.height) > pageHeight * 0.3 ||
      between.some(block => block.type === "paragraph" || block.type === "table" || block.type === "list")) return

  first.type = "paragraph"
  first.level = undefined
  for (let i = secondIndex + 1; i < blocks.length; i++) {
    const block = blocks[i], size = block.style?.fontSize ?? 0
    if (block.type === "heading" && block.level === 1 && size > 0 && size <= titleSize * 0.85) block.level = 2
  }
}

/** A running head sits in the outer band of the page with nothing beyond it and
 * spreads its parts to the page edges (tab-separated), usually with a page number. */
function isRunningHead(block: IRBlock, page: IRBlock[], pageHeight: number | undefined): boolean {
  const box = block.bbox, text = block.text?.trim()
  if (!box || !text || !pageHeight) return false
  const top = box.y + box.height >= pageHeight * 0.9
  const bottom = box.y <= pageHeight * 0.1
  if (!top && !bottom) return false
  const others = page.filter(o => o !== block && o.bbox && o.type !== "image" && o.type !== "separator")
  if (top && others.some(o => o.bbox!.y + o.bbox!.height > box.y + box.height)) return false
  if (bottom && others.some(o => o.bbox!.y < box.y)) return false
  // A title always has content after it: a single line closing the page's bottom band is a footer.
  if (bottom && box.height <= (block.style?.fontSize ?? 0) * 1.6) return true
  if (!text.includes("\t")) return false
  const parts = text.split(/\t+/).map(part => part.trim()).filter(Boolean)
  if (parts.length >= 2 && (PAGE_NUMBER.test(parts[0]) || PAGE_NUMBER.test(parts[parts.length - 1]))) return true
  const left = Math.min(...page.filter(o => o.bbox).map(o => o.bbox!.x))
  const right = Math.max(...page.filter(o => o.bbox).map(o => o.bbox!.x + o.bbox!.width))
  return right > left && box.width >= (right - left) * 0.6
}

function unbalancedClose(text: string): boolean {
  return (text.match(/\)/g)?.length ?? 0) > (text.match(/\(/g)?.length ?? 0)
}

export function demoteNonHeadingRoles(blocks: IRBlock[], pageHeights: Map<number, number>, faceNames?: Map<string, string>): void {
  const byPage = new Map<number, IRBlock[]>()
  for (const block of blocks) {
    const page = byPage.get(block.pageNumber ?? 0) ?? []
    page.push(block)
    byPage.set(block.pageNumber ?? 0, page)
  }
  // The page's prose style (face + size carrying most paragraph text): a sentence-long
  // block set in it has no typographic distinction left to make it a title.
  const bodyStyle = new Map<number, string>()
  for (const [pageNumber, page] of byPage) {
    const chars = new Map<string, number>()
    for (const b of page) {
      if ((b.type !== "paragraph" && b.type !== "heading") || !b.text || !b.style?.fontName || !b.style.fontSize) continue
      const key = `${b.style.fontName}:${b.style.fontSize}`
      chars.set(key, (chars.get(key) ?? 0) + b.text.length)
    }
    const [key, count] = [...chars].sort((a, b) => b[1] - a[1])[0] ?? []
    if (key && count! >= 300) bodyStyle.set(pageNumber, key)
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.type !== "heading" || !block.text) continue
    const text = block.text.replace(/<[^>]+>/g, "").trim()
    const fsz = block.style?.fontSize ?? 0
    // A part title between two runs of contents entries is itself an entry.
    const tocEntry = i > 0 && TOC_BLOCKS.has(blocks[i - 1]) && TOC_BLOCKS.has(blocks[i + 1])
    const page = byPage.get(block.pageNumber ?? 0) ?? []
    const proseStyle = block.style?.fontName && bodyStyle.get(block.pageNumber ?? 0) === `${block.style.fontName}:${block.style.fontSize}` &&
      text.length > 60
    // A bare section number is the first part of the title that follows it.
    const next = blocks[i + 1]
    // 제목 가운데 위에 더 큰 글자로 따로 선 장 번호("2" ⏎ "The Lost Homeland")는 따로 선 제목이다(ODL 021)
    const nb = next?.bbox, bb = block.bbox
    const chapterNumber = !!nb && !!bb && fsz >= (next?.style?.fontSize ?? 0) * 1.2 && Math.abs(bb.x - nb.x) > fsz &&
      Math.abs((bb.x + bb.width / 2) - (nb.x + nb.width / 2)) < nb.width * 0.1
    if (/^\d+(?:\.\d+)*\.?$/.test(text) && next?.type === "heading" && next.text && next.pageNumber === block.pageNumber && !chapterNumber) {
      next.text = `${block.text.trim()} ${next.text.trim()}`
      blocks.splice(i--, 1)
      continue
    }
    // 제목이 두 줄로 꺾여 둘째 줄이 소문자 낱말로 시작하면(같은 서체·크기, 바로 아래) 소문자 시작 강등에 걸려 본문으로 떨어진다 — 제목에 잇는다.
    // 줄 간격이 넓어(1.9em) 쌓인 제목 줄 잇기(mergeStackedHeadingLines)를 못 받은 둘째 줄은 아직 제목이다(ODL 199 슬라이드 패널 제목 "…E2E performance ⏎ evaluation1").
    // 캡션("Table 2: …") 아래 제목 모양 줄은 캡션에 잇지 않고 따로 강등한다(종전 동작, pdf-structure-roles 테스트 고정)
    if ((next?.type === "paragraph" || next?.type === "heading" && !CAPTION.test(text)) && next.pageNumber === block.pageNumber && next.text && next.bbox && block.bbox &&
        next.style?.fontName === block.style?.fontName && next.style?.fontSize === block.style?.fontSize && fsz > 0 &&
        /^[a-z]/.test(next.text.trim()) && next.text.trim().length <= 40 && !/[.:;!?]$/.test(next.text.trim()) &&
        block.bbox.y - (next.bbox.y + next.bbox.height) < fsz * 1.2 &&
        Math.abs(next.bbox.x - block.bbox.x) < fsz) {
      block.text = `${block.text.trim()} ${next.text.trim()}`
      block.bbox = { ...block.bbox, y: next.bbox.y, height: block.bbox.y + block.bbox.height - next.bbox.y }
      blocks.splice(i + 1, 1)
    }
    // 두 제목 줄 사이에 다른 서체로 끼운 이음 기호("WHY IT IS IMPORTANT ⏎ & ⏎ WHAT YOU CAN DO")는 한 제목이다
    const after = blocks[i + 2]
    if ((next?.type === "paragraph" || next?.type === "heading") && /^(?:&|\+|and|or)$/i.test(next.text?.trim() ?? "") &&
        after?.type === "heading" && after.text && after.pageNumber === block.pageNumber && next.pageNumber === block.pageNumber &&
        after.style?.fontSize === block.style?.fontSize) {
      block.text = `${block.text.trim()} ${next.text!.trim()} ${after.text.trim()}`
      blocks.splice(i + 1, 2)
    }
    // 본문 크기보다 작아 읽을 수 없는 크기(7.5pt 미만)의 글은 제목이 아니다 — 슬라이드 차트 축 라벨("Parsing-F1" 6pt)
    const tiny = fsz > 0 && fsz < 7.5
    // 같은 줄 왼쪽에 떨어져 놓인 소문자 항목 부호("n.")는 본문 항목의 굵은 도입문이다 — 부호와 합쳐 문단으로
    const prev = blocks[i - 1]
    if (prev?.type === "paragraph" && prev.pageNumber === block.pageNumber && /^[a-z]{1,3}[.)]$/.test(prev.text?.trim() ?? "") &&
        prev.bbox && block.bbox && Math.abs(prev.bbox.y - block.bbox.y) < 2 && prev.bbox.x + prev.bbox.width <= block.bbox.x) {
      prev.text = `${prev.text!.trim()} ${block.text.trim()}`
      prev.bbox = { ...prev.bbox, width: block.bbox.x + block.bbox.width - prev.bbox.x }
      blocks.splice(i--, 1)
      continue
    }
    // 제목 앞 절 번호가 다른 서체라 따로 떨어진 것 — 같은 줄 왼쪽("4 | Al-Sadu Symbols")이나 바로 위 왼끝 맞춘 큰 번호("4⏎Basis Fields")는 제목의 일부다
    if (prev?.type === "paragraph" && prev.pageNumber === block.pageNumber && /^\d{1,2}(?:\.\d{1,2})*\.?$/.test(prev.text?.trim() ?? "") &&
        prev.bbox && block.bbox && fsz > 0 && (
          Math.abs(prev.bbox.y - block.bbox.y) < 2 && prev.bbox.x + prev.bbox.width <= block.bbox.x && block.bbox.x - (prev.bbox.x + prev.bbox.width) < fsz * 3 ||
          Math.abs(prev.bbox.x - block.bbox.x) < 2 && (prev.style?.fontSize ?? 0) >= fsz && prev.bbox.y - (block.bbox.y + block.bbox.height) < fsz * 1.5)) {
      block.text = `${prev.text!.trim()} ${block.text.trim()}`
      blocks.splice(i - 1, 1)
      // 붙인 제목도 아래 강등 판정을 다시 받는다 — 슬라이드 차트 값 라벨 "82.65" 가 옆 라벨 "9" 를 절 번호로 붙여 글자 없는·작은 글 강등을 건너뛰고 제목으로 남았다(ODL 199)
      i -= 2
      continue
    }
    // 쪽 맨 위, 바로 아래 더 큰 제목 위에 붙은 작은 머리표(슬라이드 키커 "Recommendation Pack: Track Record")는 제목이 아니다
    const box = block.bbox, size = block.style?.fontSize ?? 0
    const kicker = !!box && size > 0 && next?.type === "heading" && next.pageNumber === block.pageNumber && !!next.bbox &&
      (next.style?.fontSize ?? 0) >= size * 1.3 && box.y - (next.bbox.y + next.bbox.height) <= size * 3 &&
      Math.min(box.x + box.width, next.bbox.x + next.bbox.width) - Math.max(box.x, next.bbox.x) >= Math.min(box.width, next.bbox.width) * 0.5 &&
      !page.some(o => o !== block && o.bbox && o.bbox.y > box.y + box.height && o.type !== "image")
    // 제목 바로 아래 본문 크기 기울임 줄(저자·소속 "Staff of the … Directorate")은 부제가 아니라 필자 줄이다
    const face = faceNames?.get(block.style?.fontName ?? "") ?? ""
    const [bodyFace, bodySize] = (bodyStyle.get(block.pageNumber ?? 0) ?? "").split(":")
    const byline = /Italic|Oblique/i.test(face) && !/Bold|Black|Heavy|Semibold/i.test(face) && !!bodyFace &&
      size <= Number(bodySize) + 0.5 && blocks[i - 1]?.type === "heading" && blocks[i - 1].pageNumber === block.pageNumber
    // OCR 로 읽은 제목 후보는 글자 상자 높이만 근거라 인포그래픽 글 조각이 올라온다 — 문장부호로 시작하거나 "…"(인식 끊김)가 들었거나,
    // 글자가 둘 미만이거나, 일곱 어절 넘는 문장이면 제목이 아니다 (ODL 141 ". Uploading you … llection", "C")
    const ocrFragment = block.style?.fontName === "ocr" && (/^[.,;:…·•-]/.test(text) || text.includes("…") ||
      (text.match(/\p{L}/gu)?.length ?? 0) < 2 || text.split(/\s+/).length > 7)
    const attributedQuote = /^[“„"«]/u.test(text) && /[”"»]$/u.test(text) &&
      next?.type === "paragraph" && next.pageNumber === block.pageNumber && /^[-–—]\s*\p{L}/u.test(next.text?.trim() ?? "") &&
      !!next.bbox && !!block.bbox && block.bbox.y - (next.bbox.y + next.bbox.height) >= 0 &&
      block.bbox.y - (next.bbox.y + next.bbox.height) <= Math.max(fsz, 1) * 4
    if (ocrFragment || tocEntry || proseStyle || kicker || byline || attributedQuote || tiny || !/\p{L}/u.test(text) && !chapterNumber || /^[a-z]/.test(text) || CAPTION.test(text) || EQUATION_NUMBER.test(block.text) || DISPLAY_MATH.test(text) ||
        // 닫는 괄호가 여는 괄호보다 많으면 앞 줄에서 이어진 문장 조각이다 ("Fact-checking) and is used …") — "1)"·"가)" 앞머리 번호는 빼고 센다
        unbalancedClose(text.replace(/^\s*[\dA-Za-z가-힣ⅰ-ⅹ]{1,3}\)\s*/, "")) ||
        isRunningHead(block, page, pageHeights.get(block.pageNumber ?? 0))) {
      block.type = "paragraph"
      block.level = undefined
    }
  }
}
