/**
 * 글자 겹치기 원·네모 번호 — 한컴 PDF 는 글자 겹치기(HWPX hp:compose SHAPE_CIRCLE·SHAPE_RECTANGLE)를 원(◯)·네모(□) 글자 한가운데에
 * 작은 숫자(글자 크기 약 0.7배)를 겹쳐 찍는다. 그대로 두면 "◯2 예외 해당 여부" 로 읽혀 HWPX·HWP5 출력("② 예외 해당 여부")과 갈린다.
 * 숫자 묶음의 가운데가 모양 글자 가운데와 맞을 때만 원 숫자 한 글자로 합친다 — 체크칸 바로 뒤 숫자("□1회", 약물운전자 정황진술보고서)는
 * 모양 글자 오른끝에 붙어 그대로다.
 */

import { enclosedNumber } from "../shared/pua.js"
import type { NormItem } from "./text-line.js"

const SHAPES = new Set(["◯", "□"])

/** 원·네모 글자 가운데에 겹친 1~2자리 숫자를 원 숫자로 합친다 (제자리) */
export function mergeEnclosedDigits(items: NormItem[]): void {
  const drop = new Set<NormItem>()
  for (const s of items) {
    if (!SHAPES.has(s.text)) continue
    const inside = items.filter(d => !drop.has(d) && /^\d\d?$/.test(d.text) && d.fontSize < s.fontSize &&
      d.x >= s.x - 1 && d.x + d.w <= s.x + s.w + 1 && Math.abs(d.y - s.y) <= s.fontSize * 0.5).sort((a, b) => a.x - b.x)
    const digits = inside.map(d => d.text).join("")
    if (!/^\d\d?$/.test(digits)) continue
    const mid = (inside[0].x + inside[inside.length - 1].x + inside[inside.length - 1].w) / 2
    if (Math.abs(mid - (s.x + s.w / 2)) > s.fontSize * 0.15) continue
    s.text = enclosedNumber(Number(digits))
    for (const d of inside) drop.add(d)
  }
  if (!drop.size) return
  let k = 0
  for (const it of items) if (!drop.has(it)) items[k++] = it
  items.length = k
}
