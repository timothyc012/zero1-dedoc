import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { closeOpenTableEnds } from "../src/pdf/open-table-ends.js"
import { extendHeaderBoxRows } from "../src/pdf/header-box-rows.js"
import { detectRuledBandTables } from "../src/pdf/ruled-band-tables.js"
import { demoteNonHeadingRoles } from "../src/pdf/heading-demote.js"
import { splitTwoColumnProse } from "../src/pdf/page-regions.js"
import { FACE_CHARS } from "../src/pdf/paragraph-lines.js"
import { detectPageLeadHeadings, detectTypographyHeadings } from "../src/pdf/block-detect.js"
import type { LineSegment } from "../src/pdf/line-types.js"
import type { NormItem } from "../src/pdf/text-line.js"
import type { IRBlock } from "../src/types.js"

const h = (y: number, x1: number, x2: number): LineSegment => ({ x1, y1: y, x2, y2: y, lineWidth: 0.5 })
const v = (x: number, y1: number, y2: number): LineSegment => ({ x1: x, y1, x2: x, y2, lineWidth: 0.5 })
const item = (text: string, x: number, y: number, w = text.length * 5, fontName = "Body"): NormItem =>
  ({ text, x, y, w, h: 9, fontSize: 9, fontName, isHidden: false })

describe("open table ends", () => {
  it("closes a header and total row that only the column rules reach", () => {
    // Body rules at 300/280/260; interior verticals run from 240 up to 330.
    const hs = [h(300, 50, 400), h(280, 50, 400), h(260, 50, 400)]
    const vs = [v(150, 240, 330), v(250, 240, 330), v(50, 260, 300), v(400, 260, 300)]
    const out = closeOpenTableEnds(hs, vs)
    const ys = out.slice(hs.length).map(l => Math.round(l.y1)).sort((a, b) => a - b)
    assert.deepEqual(ys, [240, 330])
    assert.ok(out.slice(hs.length).every(l => l.x1 === 50 && l.x2 === 400))
  })

  it("closes a last row whose column rules end at different depths (ODL 182)", () => {
    // Rules at 300/280/260; the three column rules run below the last rule to 212, 196 and 194.
    const hs = [h(300, 50, 400), h(280, 50, 400), h(260, 50, 400)]
    const vs = [v(120, 212, 300), v(220, 196, 300), v(320, 194, 300)]
    const out = closeOpenTableEnds(hs, vs, true)
    assert.deepEqual(out.slice(hs.length).map(l => Math.round(l.y1)), [212])
    assert.equal(closeOpenTableEnds(hs, vs).length, hs.length, "OCR raster rules keep the common-end rule")
    // 한 구분선이라도 마지막 괘선에서 멈추면 열린 행이 아니다
    assert.equal(closeOpenTableEnds(hs, [...vs.slice(0, 2), v(320, 260, 300)], true).length, hs.length)
  })

  it("adds nothing when a single stray vertical passes the body", () => {
    const hs = [h(300, 50, 400), h(280, 50, 400), h(260, 50, 400)]
    assert.equal(closeOpenTableEnds(hs, [v(150, 240, 330)]).length, hs.length)
  })
})

describe("header box rows", () => {
  it("extends a one-row shaded header box over the unruled rows below it", () => {
    const hs = [h(700, 50, 350), h(682, 50, 350)]
    const vs = [v(50, 682, 700), v(150, 682, 700), v(250, 682, 700), v(350, 682, 700)]
    const items = [
      item("Year", 55, 688), item("Rate", 155, 688), item("Basis", 255, 688),
      item("1", 55, 668), item(".1667", 155, 668), item("$100", 255, 668),
      item("2", 55, 650), item(".3333", 155, 650), item("$100", 255, 650),
      item("Prose that runs across every column of the table body.", 50, 610, 300),
    ]
    const out = extendHeaderBoxRows(hs, vs, items)
    assert.equal(out.horizontals.length - hs.length, 2, "one cut between the rows and one below the last")
    assert.ok(out.horizontals.slice(hs.length).every(l => l.y1 > 620), "the prose line stays outside")
  })

  it("stops at a line that crosses a column boundary", () => {
    const hs = [h(700, 50, 350), h(682, 50, 350)]
    const vs = [v(50, 682, 700), v(150, 682, 700), v(250, 682, 700), v(350, 682, 700)]
    const items = [item("A", 55, 688), item("B", 155, 688), item("C", 255, 688),
      item("A long sentence crossing the columns", 55, 668, 200), item("x", 55, 650)]
    assert.equal(extendHeaderBoxRows(hs, vs, items).horizontals.length, hs.length)
  })
})

describe("ruled band tables", () => {
  const rules = [h(770, 150, 450), h(757, 150, 450), h(735, 150, 450)]
  it("builds a booktabs table from rule bands and body column gaps", () => {
    const items = [
      item("Model", 156, 762), item("Score", 250, 762), item("Rank", 350, 762),
      item("Cand. 1", 156, 748), item("73.7", 252, 748), item("1", 352, 748),
      item("Cand. 2", 156, 739), item("73.2", 252, 739), item("2", 352, 739),
    ]
    const [found] = detectRuledBandTables(rules, [], items, 1)
    assert.ok(found)
    assert.deepEqual(found.block.table!.cells.map(r => r.map(c => c.text)),
      [["Model", "Score", "Rank"], ["Cand. 1", "73.7", "1"], ["Cand. 2", "73.2", "2"]])
    assert.equal(found.items.length, items.length)
  })

  it("reads the wrapped header lines of a two-rule table as header rows (ODL 170)", () => {
    const at = (text: string, x: number, y: number, seq: number) => ({ ...item(text, x, y, text.length * 4), fontSize: 8, h: 8, seq })
    const lines: [string, number, number][] = [
      ["Contour", 214, 686], ["Contour Strip", 282, 686], ["Contour Farming", 132, 681], ["Farming", 214, 677], ["Cropping", 282, 677],
      ["Slope Gradient", 60, 660], ["Max Slope", 132, 660], ["P Value", 214, 656], ["Strip Width", 282, 656], ["(%)", 60, 652], ["(ft)", 132, 652],
    ]
    for (const [k, y] of [635, 619, 603].entries()) lines.push([`${k}-${k + 2}`, 60, y], ["400", 132, y], ["0.6", 214, y], ["130", 282, y])
    const items = lines.map(([t, x, y], i) => at(t, x, y, i))
    const [found] = detectRuledBandTables([h(697, 56, 360), h(549, 56, 360)], [], items, 1)
    assert.ok(found)
    assert.deepEqual(found.block.table!.cells.slice(0, 3).map(r => r.map(c => c.text)), [
      ["", "Contour Farming", "Contour\nFarming", "Contour Strip\nCropping"],
      ["Slope Gradient\n(%)", "Max Slope\n(ft)", "P Value", "Strip Width"],
      ["0-2", "400", "0.6", "130"],
    ])
    // OCR 글(seq 없음)은 종전대로 한 줄 머리만 받는다
    assert.equal(detectRuledBandTables([h(697, 56, 360), h(549, 56, 360)], [], items.map(({ seq: _, ...it }) => it), 1).length, 0)
  })

  it("leaves prose between rules and contents pages alone", () => {
    const prose = [item("A sentence of prose that spans the full width of the ruled band here.", 150, 762, 300),
      item("Another line of prose that also spans the whole band from edge to edge.", 150, 745, 300)]
    assert.equal(detectRuledBandTables(rules, [], prose, 1).length, 0)
    // 항목마다 괘선을 두른 목차(ODL 044) — 마지막 열이 늘어나는 쪽번호
    const toc = [item("Introduction", 156, 762), item("1", 425, 762),
      item("Methods", 156, 750), item("7", 425, 750), item("Results", 156, 740), item("12", 425, 740)]
    assert.equal(detectRuledBandTables(rules, [], toc, 1).length, 0)
  })
})

describe("display math is not a title (#89)", () => {
  it("demotes an equation line promoted by its distinct face", () => {
    const blocks: IRBlock[] = [
      { type: "heading", level: 2, text: "3.2.2 Multi-Head Attention", pageNumber: 1, bbox: { page: 1, x: 72, y: 600, width: 200, height: 11 } },
      { type: "heading", level: 2, text: "MultiHead(Q, K, V ) = Concat(head1, ..., headh)W O", pageNumber: 1, bbox: { page: 1, x: 150, y: 560, width: 250, height: 11 } },
    ]
    demoteNonHeadingRoles(blocks, new Map([[1, 792]]))
    assert.equal(blocks[0].type, "heading")
    assert.equal(blocks[1].type, "paragraph")
  })
})

describe("two-column bands", () => {
  const line = (text: string, x: number, y: number) => item(text, x, y, 200, "Body")
  const withSize = (it: NormItem, fs: number) => ({ ...it, fontSize: fs, h: fs })
  it("reads a lifted caption first and footnotes after both columns", () => {
    const left = [
      line("this list, Richard Walker, apothecary", 50, 400), line("of Wales, adds Arabic henna, manna", 50, 386),
      line("barb. The influence of the Arabian", 50, 372), line("on the Greek, then on the French", 50, 358),
      withSize(line("34 Richard Walker, Memoirs of Medicine", 50, 300), 8), withSize(line("Sketch of Medical History", 50, 290), 8),
    ]
    const right = [
      line("FIGURE 4.3 The Honey-Moon", 300, 470), line("hand-colored.", 300, 458),
      line("Peninsula to Europe, where they were", 300, 400), line("used in tinctures, purges, and other", 300, 386),
      line("effective elixirs. Alternately, incense", 300, 372), line("its love-inducing and rejuvenating", 300, 358),
      withSize(line("35 For the influence of the Arabian", 300, 300), 8),
    ]
    const groups = splitTwoColumnProse([...left, ...right], 270)
    const firsts = groups.map(g => [...g].sort((a, b) => b.y - a.y || a.x - b.x)[0].text)
    assert.deepEqual(firsts, ["FIGURE 4.3 The Honey-Moon", "this list, Richard Walker, apothecary",
      "Peninsula to Europe, where they were", "34 Richard Walker, Memoirs of Medicine", "35 For the influence of the Arabian"])
  })

  it("keeps a numbered reference list in the column flow", () => {
    const left = [line("Body line one of the left column", 50, 400), line("Body line two of the left column", 50, 386),
      line("Body line three of the left column", 50, 372), withSize(line("1. Lee, H. G., Engineering Optimization", 50, 300), 8)]
    const right = [line("Right column body one", 300, 400), line("Right column body two", 300, 386)]
    const groups = splitTwoColumnProse([...left, ...right], 270)
    assert.equal(groups.length, 2, "the list stays with its column")
  })
})

describe("face purity of typography titles", () => {
  it("does not promote a body sentence that only starts with a bold label", () => {
    const body = "It may of course be said that quantum mechanics should allow for transitions between states of the chain."
    const blocks: IRBlock[] = []
    for (let i = 0; i < 4; i++) {
      blocks.push({ type: "paragraph", text: body, pageNumber: 1, bbox: { page: 1, x: 72, y: 700 - i * 40, width: 450, height: 22 }, style: { fontSize: 10, fontName: "Body" } })
    }
    const lead: IRBlock = { type: "paragraph", text: "Definition 1. A universe U is a chain of states", pageNumber: 1,
      bbox: { page: 1, x: 72, y: 500, width: 350, height: 10 }, style: { fontSize: 10, fontName: "Bold" } }
    const title: IRBlock = { type: "paragraph", text: "4. Entropy", pageNumber: 1,
      bbox: { page: 1, x: 72, y: 440, width: 80, height: 10 }, style: { fontSize: 10, fontName: "Bold" } }
    FACE_CHARS.set(lead, new Map([["Bold", 13], ["Body", 34]]))
    FACE_CHARS.set(title, new Map([["Bold", 10]]))
    blocks.push(lead, title)
    detectTypographyHeadings(blocks)
    assert.equal(lead.type, "paragraph")
    assert.equal(title.type, "heading")
  })
})

describe("document lead heading hierarchy", () => {
  it("keeps a display title above a bold press-release subtitle", () => {
    const blocks: IRBlock[] = [
      { type: "heading", level: 3, text: "Kanzler Merz zur Situation im Nahen Osten", pageNumber: 1,
        bbox: { page: 1, x: 70, y: 675, width: 270, height: 17 }, style: { fontSize: 14, fontName: "TitleBold" } },
      { type: "paragraph", text: "Der Sprecher der Bundesregierung, Stefan Kornelius, teilt mit:", pageNumber: 1,
        bbox: { page: 1, x: 70, y: 642, width: 300, height: 13 }, style: { fontSize: 11, fontName: "TitleBold" } },
      { type: "paragraph", text: "Bundeskanzler Friedrich Merz hat sich nach der neuerlichen Eskalation im Nahen Osten eng mit Verbündeten und Partnern abgestimmt.", pageNumber: 1,
        bbox: { page: 1, x: 70, y: 598, width: 420, height: 28 }, style: { fontSize: 11, fontName: "Body" } },
    ]
    detectPageLeadHeadings(blocks)
    assert.equal(blocks[0].type, "heading")
    assert.equal(blocks[0].level, 1)
    assert.equal(blocks[1].type, "heading")
    assert.equal(blocks[1].level, 2)
  })

  it("promotes a title below a compact official-document header table", () => {
    const blocks: IRBlock[] = [
      { type: "table", pageNumber: 1, bbox: { page: 1, x: 0, y: 540, width: 500, height: 160 }, table: { rows: 4, cols: 2, cells: [], hasHeader: false } },
      { type: "paragraph", pageNumber: 1, text: "Erklärung über eine strategische Partnerschaft zwischen Deutschland und der Ukraine", bbox: { page: 1, x: 70, y: 510, width: 340, height: 31 }, style: { fontSize: 14, fontName: "title" } },
      { type: "paragraph", pageNumber: 1, text: "2026 blicken wir zurück auf mehr als drei Jahrzehnte dynamischer Beziehungen.", bbox: { page: 1, x: 70, y: 480, width: 310, height: 11 }, style: { fontSize: 11, fontName: "body" } },
    ]
    detectPageLeadHeadings(blocks)
    assert.equal(blocks[1].type, "heading")
    assert.equal(blocks[1].level, 1)
  })

  it("keeps an existing first-page H2 below a compact table", () => {
    const blocks: IRBlock[] = [
      { type: "table", pageNumber: 1, bbox: { page: 1, x: 0, y: 540, width: 500, height: 160 }, table: { rows: 4, cols: 2, cells: [], hasHeader: false } },
      { type: "heading", level: 2, pageNumber: 1, text: "1. Gegenstand der Prüfung", bbox: { page: 1, x: 70, y: 510, width: 340, height: 20 }, style: { fontSize: 13, fontName: "section" } },
      { type: "paragraph", pageNumber: 1, text: "Die Prüfung umfasst die folgenden Unterlagen.", bbox: { page: 1, x: 70, y: 480, width: 310, height: 11 }, style: { fontSize: 10, fontName: "body" } },
    ]
    detectPageLeadHeadings(blocks)
    assert.equal(blocks[1].level, 2)
  })

  it("promotes a first-page H3 document title below a compact table", () => {
    const blocks: IRBlock[] = [
      { type: "table", pageNumber: 1, bbox: { page: 1, x: 0, y: 540, width: 500, height: 160 }, table: { rows: 4, cols: 2, cells: [], hasHeader: false } },
      { type: "heading", level: 3, pageNumber: 1, text: "Erklärung über eine strategische Partnerschaft", bbox: { page: 1, x: 70, y: 510, width: 340, height: 20 }, style: { fontSize: 13, fontName: "title" } },
      { type: "paragraph", pageNumber: 1, text: "Die Partnerschaft beruht auf den folgenden Punkten.", bbox: { page: 1, x: 70, y: 480, width: 310, height: 11 }, style: { fontSize: 10, fontName: "body" } },
    ]
    detectPageLeadHeadings(blocks)
    assert.equal(blocks[1].level, 1)
  })

  it("preserves a middle-page H2 below a small continued table", () => {
    const blocks: IRBlock[] = [
      { type: "table", pageNumber: 5, bbox: { page: 5, x: 0, y: 540, width: 500, height: 160 }, table: { rows: 4, cols: 2, cells: [], hasHeader: false } },
      { type: "heading", level: 2, pageNumber: 5, text: "3.2 Ergebnisse der Prüfung", bbox: { page: 5, x: 70, y: 510, width: 340, height: 20 }, style: { fontSize: 13, fontName: "section" } },
      { type: "paragraph", pageNumber: 5, text: "Die Prüfung ergab weitere Ergebnisse.", bbox: { page: 5, x: 70, y: 480, width: 310, height: 11 }, style: { fontSize: 10, fontName: "body" } },
    ]
    detectPageLeadHeadings(blocks)
    assert.equal(blocks[1].type, "heading")
    assert.equal(blocks[1].level, 2)
  })

  it("does not make a middle-page paragraph into a document title", () => {
    const blocks: IRBlock[] = [
      { type: "table", pageNumber: 5, bbox: { page: 5, x: 0, y: 540, width: 500, height: 160 }, table: { rows: 4, cols: 2, cells: [], hasHeader: false } },
      { type: "paragraph", pageNumber: 5, text: "3.2 Ergebnisse der Prüfung", bbox: { page: 5, x: 70, y: 510, width: 340, height: 20 }, style: { fontSize: 13, fontName: "section" } },
      { type: "paragraph", pageNumber: 5, text: "Die Prüfung ergab weitere Ergebnisse.", bbox: { page: 5, x: 70, y: 480, width: 310, height: 11 }, style: { fontSize: 10, fontName: "body" } },
    ]
    detectPageLeadHeadings(blocks)
    assert.equal(blocks[1].type, "paragraph")
  })
})
