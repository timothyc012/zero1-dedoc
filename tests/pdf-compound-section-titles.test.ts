import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRBlock } from "../src/types.js"
import { removeHeaderFooterBlocks } from "../src/pdf/block-detect.js"

// 높이와 기본 위치는 합성 입력이다. 실제 교재 제목의 x/y/폭은 아래 별도 사례에 넣는다.
const heights = new Map(Array.from({ length: 30 }, (_, i) => [i + 1, 842]))
const block = (text: string, page: number, y = 747): IRBlock => ({
  type: "paragraph", text, pageNumber: page, bbox: { page, x: 88, y, width: 60, height: 10 },
})
const removed = (texts: string[], pages = texts.map((_, i) => i + 1), y = 747) =>
  removeHeaderFooterBlocks(texts.map((t, i) => block(t, pages[i], y)), heights, [])

describe("머리 띠의 복합 절 번호 제목", () => {
  it("교재의 서로 다른 세 강의 제목을 본문으로 보존한다", () => {
    const blocks = ["강의 01-01.", "강의 01-02.", "강의 01-03."].map((text, i) => ({
      ...block(text, 11 + i), type: i === 1 ? "paragraph" as const : "heading" as const,
      ...(i === 1 ? {} : { level: 2 }),
      bbox: { page: 11 + i, x: i === 1 ? 159 : 88, y: 747, width: i ? 52 : 50, height: 10 },
    }))
    assert.deepEqual(removeHeaderFooterBlocks(blocks, heights, []), [])
  })
  for (const prefix of ["Lesson", "演習"]) it(`${prefix}의 복합 절 번호도 같은 문법으로 보존한다`, () => {
    assert.deepEqual(removed([1, 2, 3].map(n => `${prefix} 01-0${n}.`)), [])
  })
  it("PDF 원시 블록의 접두어 뒤 NUL이 제목 인식을 막지 않는다", () => {
    assert.deepEqual(removed([1, 2, 3].map(n => `강의\u0000 01-0${n}.`), [11, 12, 13]), [])
  })
  it("끝점 없는 제목과 세 성분 식별자도 보존한다", () => {
    for (const shape of ["단원 1-", "단원 1-2-"]) assert.deepEqual(removed([1, 2, 3].map(n => shape + n)), [])
  })
  it("같은 복합 절 제목이 되풀이되면 기존 머리말 규칙을 따른다", () => {
    assert.deepEqual(removed(Array(3).fill("Chapter 1-1.")), [0, 1, 2])
    assert.deepEqual(removed(["Chapter 1-1.", "Chapter 1-1.", "Chapter 1-2.", "Chapter 1-2."]), [0, 1, 2, 3])
  })
  it("실제 반복 머리말 문구는 계속 제거한다", () => {
    assert.deepEqual(removed(Array(8).fill("01 누적과 연결 & 세계와 자아의 관계"), [4, 6, 8, 10, 12, 14, 16, 18]), [0, 1, 2, 3, 4, 5, 6, 7])
  })
  it("하단 복합 쪽 번호와 상단 숫자뿐인 쪽 번호는 계속 제거한다", () => {
    assert.deepEqual(removed([1, 2, 3].map(n => `Page 1-${n}`), undefined, 30), [0, 1, 2])
    assert.deepEqual(removed(["1-1", "1-2", "1-3"]), [0, 1, 2])
  })
  it("제목 뒤에 별도 쪽 번호가 있으면 보호하지 않는다", () => {
    assert.deepEqual(removed([1, 2, 3].map(n => `Chapter 1-1. ${n}`)), [0, 1, 2])
  })
  it("성긴 쪽 번호와 하단의 복합 번호 문구는 기존 판정을 따른다", () => {
    assert.deepEqual(removed([5, 16, 24].map(n => `DCT Technology Inc. ${n}`), [6, 17, 25]), [0, 1, 2])
    assert.deepEqual(removed([5, 6, 7].map(n => `부속서 3의 2.3.${n} 참조 - 역주`), undefined, 30), [0, 1, 2])
  })
})
