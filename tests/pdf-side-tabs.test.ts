/** 쪽 옆 색인 탭 — 장·절 이름을 쪽 바깥 띠에 세로로 찍은 것은 되풀이 장식이다 (src/pdf/side-tabs.ts) */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isSideTabTable, removeSideTabs, SIDE_TAB_TABLES } from "../src/pdf/side-tabs.js"
import type { IRBlock, IRTable } from "../src/types.js"

const W = 555
const b = (text: string, page: number, x: number, width = 12): IRBlock => ({ type: "paragraph", text, pageNumber: page, bbox: { page, x, y: 400, width, height: 12 } })

describe("removeSideTabs", () => {
  it("drops short text repeated in the outer side band across pages (행정업무운영 편람 '제1절'·'공')", () => {
    const pages = [33, 35, 37, 39]
    const blocks = pages.flatMap(p => [b("제1절", p, 505), b("공", p, 510), b("본문 단락입니다. 내용이 이어집니다", p, 100, 300)])
    const out = removeSideTabs(blocks, new Map(pages.map(p => [p, W] as [number, number])))
    assert.deepEqual(out.map(x => x.text), Array(4).fill("본문 단락입니다. 내용이 이어집니다"))
  })

  it("장마다 되풀이되는 절 탭 — 책 전체로는 성겨도 한 장 안에서 몰려 되풀이되면 뺀다 ('제1절' 이 장마다 몇 쪽씩)", () => {
    const pages = [10, 11, 12, 13, 60, 61, 62, 120, 121, 122, 123]
    const blocks = pages.flatMap(p => [b("제1절", p, 505), b("본문 단락입니다. 내용이 이어집니다", p, 100, 300)])
    const out = removeSideTabs(blocks, new Map(pages.map(p => [p, W] as [number, number])))
    assert.ok(out.every(x => x.text !== "제1절"))
  })

  it("keeps side text that appears once or sparsely, and long text", () => {
    const blocks = [b("주석", 1, 505), b("주석", 30, 505), b("주석", 60, 505), b("가장자리에 놓인 긴 설명 문장입니다", 2, 500, 50), b("두 단 왼단 첫머리 뒤 본문 줄입니다", 5, 28, 250), b("따라서", 5, 28, 30), b("따라서", 6, 28, 30), b("따라서", 7, 28, 30), b("두 단 왼단 첫머리 뒤 본문 줄입니다", 6, 28, 250), b("두 단 왼단 첫머리 뒤 본문 줄입니다", 7, 28, 250)]
    // 두 단 왼단 첫머리의 짧은 줄("따라서")은 본문 왼끝에 붙어 있어 탭이 아니다 (수능 모의고사 해설)
    assert.equal(removeSideTabs(blocks, new Map([1, 2, 5, 6, 7, 30, 60].map(p => [p, W] as [number, number]))).length, blocks.length)
  })

  it("격쪽 탭은 간지 두 쪽이 끼어도 한 묶음 — 짝수 쪽 책등 60·62 | 68~74 (응급의료기관 평가 기준집)", () => {
    const pages = [60, 62, 68, 70, 72, 74]
    const blocks = pages.flatMap(p => [b("응", p, 37, 9), b("본문 단락입니다. 내용이 이어집니다", p, 100, 300)])
    const out = removeSideTabs(blocks, new Map(pages.map(p => [p, 595] as [number, number])))
    assert.ok(out.every(x => x.text !== "응"))
  })

  it("단원 탭 표는 글이 바뀌어도 자리(띠·x) 되풀이로 뺀다 — 홀수 쪽 '필수영역 | 필수 7 | 시설의 적절 운용'", () => {
    const tab = (p: number, label: string): IRBlock => {
      const table: IRTable = { rows: 3, cols: 1, hasHeader: false, cells: ["필수영역", label, "시\n설"].map(text => [{ text, colSpan: 1, rowSpan: 1 }]) }
      SIDE_TAB_TABLES.add(table)
      return { type: "table", table, pageNumber: p, bbox: { page: p, x: 558, y: 237, width: 54, height: 545 } }
    }
    const pages = [61, 63, 65, 67]
    const blocks = pages.flatMap((p, i) => [tab(p, `필수 ${i + 7}`), b("본문 단락입니다. 내용이 이어집니다", p, 100, 300)])
    const out = removeSideTabs(blocks, new Map(pages.map(p => [p, 612] as [number, number])))
    assert.deepEqual(out.map(x => x.type), Array(4).fill("paragraph"))
    // 두 쪽뿐이면 남긴다(되풀이 근거 없음)
    assert.equal(removeSideTabs(blocks.slice(0, 4), new Map(pages.map(p => [p, 612] as [number, number]))).length, 4)
  })
})

describe("isSideTabTable", () => {
  const table = (texts: string[]): IRTable => ({ rows: texts.length, cols: 1, hasHeader: false, cells: texts.map(text => [{ text, colSpan: 1, rowSpan: 1 }]) })
  const body = [{ x: 71, y: 500, w: 469 }, { x: 76, y: 300, w: 300 }]
  const box = { x1: 558, y1: 237, x2: 612, y2: 782 }

  it("쪽 바깥 띠의 좁고 긴 1열 짧은 글 표 — 높이가 겹치는 글이 모두 안쪽", () => {
    assert.ok(isSideTabTable(box, table(["필수영역", "필수\n7", "시\n설\n의"]), body, 612, 842))
  })

  it("띠 밖·짧은 표·긴 칸 글·바깥쪽에 글이 있으면 아니다", () => {
    assert.ok(!isSideTabTable({ ...box, x1: 400 }, table(["필수영역"]), body, 612, 842))
    assert.ok(!isSideTabTable({ ...box, y1: 600 }, table(["필수영역"]), body, 612, 842))
    assert.ok(!isSideTabTable(box, table(["가장자리 칸에 든 긴 설명 문장은 장이나 절의 탭 이름이 아닙니다"]), body, 612, 842))
    assert.ok(!isSideTabTable(box, table(["필수영역"]), [...body, { x: 600, y: 400, w: 8 }], 612, 842))
  })
})
