import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRBlock } from "../src/types.js"
import { removeHeaderFooterBlocks } from "../src/pdf/block-detect.js"

const heights = new Map(Array.from({ length: 60 }, (_, i) => [i + 1, 841]))
const block = (text: string, page: number, y = 774): IRBlock => ({ type: "paragraph", text, pageNumber: page, bbox: { page, x: 42, y, width: 60, height: 12 } })
const removed = (texts: string[], pages = texts.map((_, i) => i + 1), y = 774) => removeHeaderFooterBlocks(texts.map((t, i) => block(t, pages[i], y)), heights, [])
describe("머리 띠에 있는 괄호 서식 제목", () => {
  it("hwp3-sample16의 본문 양식 제목 5개를 보존한다", () => {
    const nums = [1, 4, 5, 7, 9]
    assert.deepEqual(removed(nums.map(n => `【양식 ${n}】`), [51, 54, 55, 57, 59]), [])
  })
  for (const [left, right] of [["【", "】"], ["〔", "〕"], ["[", "]"], ["(", ")"], ["〈", "〉"], ["《", "》"], ["「", "」"], ["<", ">"]]) {
    it(`${left}${right} 안의 한글·영문 제목 번호는 쪽 번호 증거로 쓰지 않는다`, () => {
      for (const title of ["양식", "Form"]) assert.deepEqual(removed([1, 2, 3].map(n => `${left}${title} ${n}${right}`)), [])
    })
  }
  it("숫자뿐인 괄호와 일반 쪽 번호는 계속 지운다", () => {
    for (const [left, right] of [["【", "】"], ["[", "]"], ["(", ")"], ["- ", " -"]]) {
      assert.deepEqual(removed([1, 2, 3].map(n => `${left}${n}${right}`)), [0, 1, 2])
    }
  })
  it("여러 쪽에 같은 제목이 되풀이되면 기존 머리말 규칙을 적용한다", () => {
    assert.deepEqual(removed(["【제1장 총칙】", "【제1장 총칙】", "【제2장 총칙】", "【제2장 총칙】"]), [0, 1, 2, 3])
  })
  it("닫는 괄호가 맞지 않으면 제목으로 인정하지 않는다", () => {
    assert.deepEqual(removed([1, 2, 3].map(n => `【양식 ${n}]`)), [0, 1, 2])
  })
  it("하단의 괄호 달린 page 번호는 기존 바닥글 규칙을 따른다", () => {
    assert.deepEqual(removed([1, 2, 3].map(n => `[Page ${n}]`), undefined, 30), [0, 1, 2])
  })
  it("낱말과 숫자가 떨어진 회사 이름 쪽 번호는 계속 지운다", () => {
    assert.deepEqual(removed([5, 16, 24].map(n => `DCT Technology Inc. ${n}`), [6, 17, 25]), [0, 1, 2])
  })
})
