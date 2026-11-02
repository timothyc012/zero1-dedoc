import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { splitBudgetSubRows } from "../src/pdf/budget-sub-rows.js"
import type { LineSegment } from "../src/pdf/line-types.js"
import type { NormItem } from "../src/pdf/text-line.js"

const item = (text: string, x: number, y: number, w = 60): NormItem =>
  ({ text, x, y, w, h: 8, fontSize: 9, fontName: "ocr", isHidden: false })
const h = (y: number): LineSegment => ({ x1: 0, y1: y, x2: 400, y2: y, lineWidth: 0.5 })
const v = (x: number): LineSegment => ({ x1: x, y1: 100, x2: x, y2: 300, lineWidth: 0.5 })
// 열: 과목 0~200 | 예산액 200~280 | 전년도 280~340 | 증감 340~400, 행: 머리 300~280 | 본문 280~100
const lines = { horizontals: [h(300), h(280), h(100)], verticals: [0, 200, 280, 340, 400].map(v) }

describe("사업명세서 무괘선 하위 행", () => {
  it("목 코드 줄 앞과 목 다음 첫 산출 내역 줄 앞에 가상 괘선, 이어지는 ○ 줄은 같은 행", () => {
    const items = [
      item("201 일반운영비", 5, 260), item("4,800", 210, 260), item("3,960", 290, 260), item("840", 350, 260),
      item("01 사무관리비", 5, 245), item("4,800", 210, 245), item("3,960", 290, 245), item("840", 350, 245),
      item("○공인노무사 자문수당", 5, 230, 150), item("4,000", 210, 230),
      item("○회의 수당", 5, 215, 150), item("800", 210, 215),
    ]
    const out = splitBudgetSubRows(lines.horizontals, lines.verticals, items)
    const added = out.slice(lines.horizontals.length).map(l => l.y1).sort((a, b) => b - a)
    assert.deepEqual(added, [256.5, 241.5])
    assert.ok(out.slice(lines.horizontals.length).every(l => l.x1 === 0 && l.x2 === 400))
  })

  it("OCR 이 ○ 를 ㅇ 으로 읽은 첫 내역 줄 앞에서 가르고, 뒤따르는 ○ 줄은 같은 행", () => {
    const items = [
      item("02 공공운영비", 5, 260), item("14,140", 210, 260), item("14,140", 290, 260),
      item("ㅇ공공요금 및 제세", 5, 245, 150), item("3,020", 210, 245),
      item("○차량선박비", 5, 230, 150), item("7,920", 210, 230),
    ]
    const out = splitBudgetSubRows(lines.horizontals, lines.verticals, items)
    assert.deepEqual(out.slice(lines.horizontals.length).map(l => l.y1), [256.5])
  })

  it("글머리를 놓친 내역 첫 줄도 금액이 맞춰져 있으면 가르고, 금액 없는 꺾인 목 이름 줄은 안 가른다", () => {
    const missed = [
      item("02 공공운영비", 5, 260), item("14,140", 210, 260), item("14,140", 290, 260),
      item("공공요금 및 제세", 5, 245, 150), item("3,020", 210, 245),
      item("○차량선박비", 5, 230, 150), item("7,920", 210, 230),
    ]
    assert.deepEqual(splitBudgetSubRows(lines.horizontals, lines.verticals, missed).slice(lines.horizontals.length).map(l => l.y1), [256.5])
    const wrapped = [
      item("01 자산 및 물품", 5, 260), item("5,300", 210, 260), item("0", 290, 260),
      item("취득비", 5, 245),
      item("○영상장비 구입", 5, 230, 150), item("5,300", 210, 230),
    ]
    assert.deepEqual(splitBudgetSubRows(lines.horizontals, lines.verticals, wrapped).slice(lines.horizontals.length).map(l => l.y1), [241.5])
    // 금액이 꺾인 둘째 줄에 맞춰진 글머리 없는 내역 — 둘째 줄 앞도, 뒤 ○ 앞도 가르지 않는다
    const late = [
      item("01 사무관리비", 5, 260), item("3,200", 210, 260), item("2,240", 290, 260),
      item("사회적경제육성위원회 등 회의참석수당", 5, 245, 190),
      item("1,000,000원", 5, 230), item("1,000", 210, 230),
      item("○사회적경제 활성화", 5, 215, 150), item("2,200", 210, 215),
    ]
    assert.equal(splitBudgetSubRows(lines.horizontals, lines.verticals, late).length, lines.horizontals.length)
  })

  it("산출 내역 줄이 없는 표(긴 칸 글이 꺾인 행)는 그대로", () => {
    const items = [
      item("101 인건비 지급 기준에 따라", 5, 260, 190), item("12,000", 210, 260),
      item("02 항목 설명이 이어지는 줄", 5, 245, 190), item("3,000", 210, 245),
    ]
    assert.equal(splitBudgetSubRows(lines.horizontals, lines.verticals, items), lines.horizontals)
  })

  it("경계 아래에 금액이 없으면 가르지 않는다", () => {
    const items = [
      item("01 사무관리비", 5, 245), item("4,800", 210, 245), item("3,960", 290, 245),
      item("○내역 설명만 있는 줄", 5, 230, 150),
    ]
    assert.equal(splitBudgetSubRows(lines.horizontals, lines.verticals, items).length, lines.horizontals.length)
  })
})
