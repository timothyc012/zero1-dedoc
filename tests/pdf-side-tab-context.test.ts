import { it } from "node:test"
import assert from "node:assert/strict"
import { extractPageBlocksWithLines } from "../src/pdf/page-blocks.js"
import { detectHeadings, detectPageLeadHeadings } from "../src/pdf/block-detect.js"
import { removeSideTabs } from "../src/pdf/side-tabs.js"
import { sideTabGlyphs } from "../src/pdf/cluster-detector.js"
import { attachSideTabBlocks } from "../src/pdf/side-tab-blocks.js"
import type { NormItem } from "../src/pdf/text-line.js"
import type { IRBlock } from "../src/types.js"

const item = (text: string, x: number, y: number, w: number, fontSize = 6): NormItem =>
  ({ text, x, y, w, h: fontSize, fontSize, fontName: "body", isHidden: false })
const pillar = ["구", "급", "차", "운", "용", "통", "신", "고", "(", "보", ")", "업", "무"]
  .map((text, i) => item(text, 437, [400, 393, 386, 379, 372, 365, 358, 351, 350, 337, 336, 329, 322][i], 6))
const prose = Array.from({ length: 4 }, (_, i) => item("본문 단락입니다. 별도의 본문 영역에 내용이 이어집니다.", 90, 390 - i * 18, 310, 9))
const cap = item("Ⅹ", 433, 420, 13, 13)
const ops = { fnArray: [], argsArray: [] }
const extract = (items: NormItem[], page = 5) => extractPageBlocksWithLines(structuredClone(items), page, ops, 454, 652)

it("retains baseline punctuation groups for the existing three-page marginal repetition policy", () => {
  const b = (text: string, page: number, x: number, width: number): IRBlock => ({ type: "paragraph", text,
    pageNumber: page, bbox: { page, x, y: 350, width, height: 7 } })
  const prior = [1, 3].flatMap(page => [b("고(", page, 437, 6), b("보)", page, 437, 6),
    b("독립적인 본문 문장이 계속 이어집니다.", page, 90, 310)])
  const current = extract([...pillar, cap, ...prose])
  assert.ok(current.some(b => b.text === "고("))
  assert.ok(current.some(b => b.text === "보)"))
  const out = removeSideTabs([...prior, ...current], new Map([1, 3, 5].map(page => [page, 454])))
  assert.ok(!out.some(b => ["고(", "보)", "고", "보", "(", ")"].includes(b.text ?? "")))
  assert.ok(out.some(b => b.text?.includes("본문 단락")))
  assert.ok(removeSideTabs([...prior.slice(0, 3), ...current], new Map([[1, 454], [5, 454]]))
    .some(b => b.text === "고("), "two occurrences still remain")
})

it("preserves chapter/subsection lead context and places new marginal groups after their source cap", () => {
  const chapter = { ...item("Chapter introduction", 80, 550, 180, 15), fontName: "chapter" }
  const subtitle = item("A genuine subsection with a separate explanatory reference", 90, 505, 310, 9)
  const long = Array.from({ length: 3 }, (_, i) => ({ ...item("A substantial paragraph follows the subsection and gives its actual content.",
    90, 475 - i * 13, 310, 9), fontName: "prose" }))
  const after = item("A body line below the marginal badge remains in its original reading position.", 90, 290, 310, 9)
  const blocks = extract([...pillar, cap, chapter, subtitle, ...long, ...prose, after])
  detectHeadings(blocks, 9)
  detectPageLeadHeadings(blocks)
  assert.equal(blocks[0].text, chapter.text)
  assert.equal(blocks.find(b => b.text === subtitle.text)?.type, "heading")
  const capIndex = blocks.findIndex(b => b.text === cap.text)
  assert.ok(capIndex >= 0)
  assert.deepEqual(blocks[capIndex].bbox, { page: 5, x: 433, y: 420, width: 13, height: 13 })
  assert.equal(blocks[capIndex + 1].text, "구")
  assert.ok(blocks.findIndex(b => b.text === after.text) > capIndex + pillar.length - 2)
})

it("keeps previously recognized marginal glyph prefix and single-glyph shape unchanged", () => {
  const blocks = extract([...pillar.filter(i => !/[()]/.test(i.text)), ...prose])
  assert.deepEqual(blocks.slice(0, 11).map(b => b.text), pillar.filter(i => !/[()]/.test(i.text)).map(i => i.text))
  assert.deepEqual(blocks[0].bbox, { page: 5, x: 437, y: 400, width: 6, height: 6 })
})

it("keeps cap context local to each classification of the same source objects", () => {
  const glyphs = pillar.filter(i => !/[()]/.test(i.text))
  sideTabGlyphs([...glyphs, cap, ...prose])
  const legacy = sideTabGlyphs([...glyphs, ...prose])
  const body: IRBlock[] = [{ type: "paragraph", text: "Untouched body", pageNumber: 5 }]
  assert.equal(attachSideTabBlocks(legacy, body, 5)[0].text, "구")
})

it("appends new glyph groups when the original cap has no containing output block", () => {
  const tab = sideTabGlyphs([...pillar, cap, ...prose])
  const body: IRBlock[] = [{ type: "heading", text: "Chapter", pageNumber: 5,
    bbox: { page: 5, x: 80, y: 550, width: 180, height: 15 } }]
  const out = attachSideTabBlocks(tab, body, 5)
  assert.equal(out[0].text, "Chapter")
  assert.equal(out[1].text, "구")
  assert.ok(out.some(b => b.text === "고("))
})

it("anchors to the tight source text block instead of overlapping images and broad containers", () => {
  const tab = sideTabGlyphs([...pillar, cap, ...prose])
  const box = { page: 5, x: 400, y: 300, width: 50, height: 200 }
  const body: IRBlock[] = [
    { type: "image", text: "diagram.png", pageNumber: 5, bbox: { ...box } },
    { type: "table", pageNumber: 5, bbox: { ...box }, table: { rows: 1, cols: 1,
      cells: [[{ text: "An independent wide container", rowSpan: 1, colSpan: 1 }]] } },
    { type: "paragraph", text: cap.text, pageNumber: 5,
      bbox: { page: 5, x: cap.x, y: cap.y, width: cap.w, height: cap.h } },
    { type: "paragraph", text: "Body after the cap", pageNumber: 5 },
  ]
  const before = structuredClone(body.slice(0, 3))
  const out = attachSideTabBlocks(tab, body, 5)
  assert.deepEqual(out.slice(0, 3), before)
  assert.equal(out[3].text, "구")
  assert.equal(out.at(-1)?.text, "Body after the cap")
  const imageOnly = attachSideTabBlocks(sideTabGlyphs([...pillar, cap, ...prose]), [body[0]], 5)
  assert.equal(imageOnly[0].type, "image")
  assert.equal(imageOnly[1].text, "구")
})
