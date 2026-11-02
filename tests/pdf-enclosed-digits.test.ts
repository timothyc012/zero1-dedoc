/**
 * PDF 글자 겹치기 원·네모 번호 — 한컴 PDF 가 원(◯)·네모(□) 글자 한가운데에 작은 숫자를 겹쳐 찍은 것을 원 숫자로 합친다.
 * 좌표는 실파일 실측(이해충돌 지침 별지 "◯2 예외 해당 여부" 10.8pt 원 + 7.6pt 숫자, 결재 컨설팅 16pt 네모 + 11pt 숫자,
 * 약물운전자 정황진술보고서 "□1회" 체크칸)을 정수로 줄였다.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mergeEnclosedDigits } from "../src/pdf/enclosed-digits.js"
import type { NormItem } from "../src/pdf/text-line.js"

const item = (text: string, x: number, w: number, fontSize: number, y = 300): NormItem =>
  ({ text, x, y, w, h: fontSize, fontSize, fontName: "f", isHidden: false })

const texts = (items: NormItem[]) => items.map(i => i.text)

describe("PDF 글자 겹치기 원·네모 번호", () => {
  it("원 한가운데 작은 숫자는 원 숫자 한 글자", () => {
    const items = [item("◯", 69, 11, 11), item("2", 72, 4, 8, 301), item("예외", 82, 20, 10)]
    mergeEnclosedDigits(items)
    assert.deepEqual(texts(items), ["②", "예외"])
  })
  it("네모 안 숫자·두 조각 두 자리도 합친다", () => {
    const box = [item("□", 100, 16, 16), item("1", 105, 6, 11)]
    mergeEnclosedDigits(box)
    assert.deepEqual(texts(box), ["①"])
    const two = [item("◯", 50, 11, 11), item("1", 52, 3, 8), item("2", 55, 3, 8)]
    mergeEnclosedDigits(two)
    assert.deepEqual(texts(two), ["⑫"])
  })
  it("가운데가 어긋난 숫자·같은 크기 숫자는 그대로", () => {
    const check = [item("□", 200, 11, 11), item("1", 206, 4, 7), item("회", 210, 7, 7)]
    mergeEnclosedDigits(check)
    assert.deepEqual(texts(check), ["□", "1", "회"])
    const same = [item("◯", 69, 11, 11), item("2", 72, 4, 11)]
    mergeEnclosedDigits(same)
    assert.deepEqual(texts(same), ["◯", "2"])
  })
})
