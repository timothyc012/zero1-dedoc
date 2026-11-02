import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { cellTextToString } from "../src/pdf/cell-text.js"

const ocr = (text: string, x: number, y: number, w: number, h: number) => ({ text, x, y, w, h, fontSize: Math.round(h / 0.9), fontName: "ocr" })

describe("OCR 칸 글 줄 묶기", () => {
  it("가로로 겹치는 상자는 아래 끝이 허용치 안이어도 위아래 두 줄", () => {
    // 괄호로 키 큰 아랫줄 상자가 옆 칸 금액 줄 높이로 옮겨져 윗줄과 아래 끝 6pt 차
    assert.equal(cellTextToString([ocr("선거기간", 101, 425, 32, 9), ocr("(선거운동기간+선거일)", 80, 419, 75, 13)]), "선거기간\n(선거운동기간+선거일)")
  })
  it("두 줄 사이 높이의 옆 이름표는 종전대로 첫 줄에 붙는다", () => {
    const t = cellTextToString([ocr("2차", 60, 424, 14, 9), ocr("초불확실성 시대의 도전과 대응", 80, 428, 150, 9), ocr("국내 보건 분야의 과제", 80, 416, 120, 9)])
    assert.equal(t.split("\n")[0].startsWith("2차"), true)
  })
})
