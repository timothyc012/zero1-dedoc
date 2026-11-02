/**
 * 서식 표 빈칸 patch (#144) — 무수정·빈칸 채움이 "표 좌표 재현 불일치" 로 건너뛰던 세 경우를 고정한다.
 *  1. 머리 행 + 빈 행 GFM 표 — 재현이 빈 행을 빼 행 수가 어긋났다(builder 는 앵커 칸이 다 빈 행을 남긴다)
 *  2. "년 월 일" 칸이 있는 HTML 표 — 재현의 sanitizeText 사본에 날짜 칸 규칙이 없어 "년월일" 로 붙였다
 *  3. 끝 빈 열 보존(--keep-empty-cols) 추출본 — patch 기준이 트림 추출이라 칸 수·병합 변경으로 거부했다
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { markdownToHwpx, parse, patchHwpx } from "../src/index.js"

const u8 = (ab: ArrayBuffer) => new Uint8Array(ab)

async function fillAndReparse(md: string, edit: (extracted: string) => string, opts: { keepTrailingEmptyCols?: boolean } = {}) {
  const doc = u8(await markdownToHwpx(md))
  const extracted = await parse(Buffer.from(doc), { layoutTables: "keep", ...opts })
  assert.ok(extracted.success)
  const edited = edit(extracted.markdown)
  assert.notEqual(edited, extracted.markdown, "편집이 들어가야 한다")
  const patched = await patchHwpx(doc, edited)
  assert.ok(patched.success, patched.error)
  assert.deepEqual(patched.skipped, [])
  const reparsed = await parse(Buffer.from(patched.data!), { layoutTables: "keep", ...opts })
  assert.ok(reparsed.success)
  return { patched, edited, reparsed: reparsed.markdown }
}

describe("서식 표 빈칸 patch (#144)", () => {
  it("머리 행 + 빈 행 GFM 표의 빈 행을 채운다", async () => {
    const md = "| 성명 | 직위 | 비고 |\n| --- | --- | --- |\n|  |  |  |\n"
    const { patched, edited, reparsed } = await fillAndReparse(md, m => m.replace("|  |  |  |", "| 홍길동 | 과장 |  |"))
    assert.ok(patched.applied > 0)
    assert.equal(reparsed.trim(), edited.trim())
  })

  it("'년 월 일' 칸이 있는 표의 빈칸을 채운다", async () => {
    const md = "<table>\n<tr><th>신청인</th><th></th></tr>\n<tr><td>신청일</td><td>년 월 일</td></tr>\n</table>\n"
    const { patched, edited, reparsed } = await fillAndReparse(md, m => m.replace("| 신청인 |  |", "| 신청인 | 곰돌이 |"))
    assert.equal(patched.applied, 1)
    assert.ok(reparsed.includes("| 년 월 일 |"))
    assert.equal(reparsed.trim(), edited.trim())
  })

  it("끝 빈 열 보존 추출본으로 잘리던 끝 칸(대표자 값)을 채운다", async () => {
    const md = "<table>\n<tr><th>회사명</th><th></th><th>대표자</th><th></th></tr>\n<tr><td>주소</td><td colspan=\"3\"></td></tr>\n</table>\n"
    const { patched, edited, reparsed } = await fillAndReparse(
      md,
      m => m.replace("<th>대표자</th><th></th>", "<th>대표자</th><th>홍길동</th>").replace("<td colspan=\"3\"></td>", "<td colspan=\"3\">서울</td>"),
      { keepTrailingEmptyCols: true },
    )
    assert.equal(patched.applied, 2)
    assert.equal(reparsed.trim(), edited.trim())
  })
})
