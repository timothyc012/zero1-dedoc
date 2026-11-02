import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { demoteNonHeadingRoles } from "../src/pdf/heading-demote.js"
import type { IRBlock } from "../src/types.js"
const heading = (text: string, y: number, height = 11, face = "Body"): IRBlock => ({
  type: "heading", text, level: 3, pageNumber: 1, style: { fontName: face, fontSize: 11 },
  bbox: { page: 1, x: 90, y, width: 311, height },
})
const sentence = "운용자는 관련 기준을 준수하여야 하며 필요한 내용을 이용자에게 안내하고 관계 서류를 별도로 보관하여야 함"
describe("PDF prose followed by statutory citations", () => {
  it("keeps wrapped explanatory prose and its same-style citation as paragraphs", () => {
    const blocks = [heading("운용 기준", 500, 12, "Title"), heading(sentence, 450, 29), heading("(관련법 제15조제2항)", 433)]
    const original = blocks.map(b => b.text)
    demoteNonHeadingRoles(blocks, new Map([[1, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["heading", "paragraph", "paragraph"])
    assert.deepEqual(blocks.map(b => b.text), original)
  })
  it("keeps the citation aligned after a leading raster bullet", () => {
    const prose = heading("○ " + sentence, 450, 29)
    const reference = heading("(관련법 제15조제2항)", 433)
    reference.bbox!.x += 14
    const blocks = [prose, reference]
    demoteNonHeadingRoles(blocks, new Map([[1, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["paragraph", "paragraph"])
  })
  it("retains the paragraph role of a citation after an already detected bullet list", () => {
    const prose = heading("○ " + sentence, 450, 29)
    prose.type = "list"; prose.listType = "unordered"
    const reference = heading("(관련법 제15조제2항)", 433)
    reference.bbox!.x += 14
    const blocks = [prose, reference]
    demoteNonHeadingRoles(blocks, new Map([[1, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["list", "paragraph"])
  })
  it("also recognizes an English Article reference after wrapped prose", () => {
    const blocks = [heading("The operator must keep all required records and provide the information requested by the user.", 450, 29), heading("(Article 15, Section 2)", 433)]
    demoteNonHeadingRoles(blocks, new Map([[1, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["paragraph", "paragraph"])
  })
  it("preserves an independent parenthesized heading and a differently styled subtitle", () => {
    const blocks = [heading(sentence, 450, 29, "Title"), heading("(관련법 제15조제2항)", 433), heading("(Article 3)", 380)]
    demoteNonHeadingRoles(blocks, new Map([[1, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["heading", "heading", "heading"])
  })
  it("does not use a citation on another page or in a separate column", () => {
    const far = heading("(관련법 제15조제2항)", 433)
    far.bbox!.x = 430
    const other = heading("(관련법 제15조제2항)", 433)
    other.pageNumber = 2
    other.bbox!.page = 2
    const blocks = [heading(sentence, 450, 29), far, other]
    demoteNonHeadingRoles(blocks, new Map([[1, 652], [2, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["heading", "heading", "heading"])
  })
})

describe("circled numbered prose has list roles", () => {
  const list = () => [heading("① " + sentence, 520), heading("② " + sentence, 460, 29), heading("③ " + sentence, 430), heading("④ " + sentence, 385, 29)]
  it("demotes the same-style sequential prose list and its matching bullet instruction", () => {
    const blocks = [heading("1) 진짜 절 제목", 550, 11, "Title"), ...list(), heading("○ 최종 처리에 필요한 내용을 담당자에게 반드시 안내", 345)]
    const original = blocks.map(b => b.text)
    demoteNonHeadingRoles(blocks, new Map([[1, 652]]))
    assert.deepEqual(blocks.map(b => b.type), ["heading", "paragraph", "paragraph", "paragraph", "paragraph", "paragraph"])
    assert.deepEqual(blocks.map(b => b.text), original)
  })
  it("keeps short numbered titles and differently styled or separated headings", () => {
    const short = [heading("① 신청", 520), heading("② 검토", 480), heading("③ 결과", 440)]
    const bold = list()
    demoteNonHeadingRoles(short, new Map([[1, 652]]))
    demoteNonHeadingRoles(bold, new Map([[1, 652]]), new Map([["Body", "Document-Bold"]]))
    assert.ok([...short, ...bold].every(b => b.type === "heading"))
    const columns = list(); columns[2].bbox!.x = 400; columns[3].bbox!.x = 400
    demoteNonHeadingRoles(columns, new Map([[1, 652]]))
    assert.ok(columns.every(b => b.type === "heading"))
  })
})
