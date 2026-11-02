/** 공문 표 합계 행 기본 위치(생성)와 MCP lint_document (2026-10) */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { markdownToHwpx } from "../src/index.js"
import { registerLintTools } from "../src/mcp/tools-lint.js"
import { resolveTotalRow } from "../src/hwpx/gen-table.js"

const md = [
  "# 예산 보고", "", "## 소요예산", "",
  "| 구분 | 금액 |", "|---|---:|",
  "| 이용료 | 361,200 |", "| 구축비 | 333,600 |", "| 합계 | 694,800 |",
].join("\n")
const order = async (buf: Uint8Array | ArrayBuffer) => {
  const sec = await (await JSZip.loadAsync(buf)).file("Contents/section0.xml")!.async("string")
  return ["이용료", "구축비", "합계"].map((t) => sec.indexOf(`<hp:t>${t}</hp:t>`))
}

describe("공문 표 합계 행", () => {
  it("보고서 프리셋 기본은 머리행 바로 아래", async () => {
    const [a, b, total] = await order(await markdownToHwpx(md, { gongmun: { preset: "보고서" } }))
    assert.ok(total > 0 && total < a && a < b, `합계 ${total}, 이용료 ${a}, 구축비 ${b}`)
  })
  it("개조식(v5 밖 엔진)도 기본 맨 위", async () => {
    const [a, b, total] = await order(await markdownToHwpx(md, { gongmun: { preset: "개조식" } }))
    assert.ok(total > 0 && total < a && a < b, `합계 ${total}, 이용료 ${a}, 구축비 ${b}`)
  })
  it("서식 프로필이 있으면 지정 없을 때 원고 그대로(셀 좌표 서식 보호)", () => {
    assert.equal(resolveTotalRow(null, true), "keep")
    assert.equal(resolveTotalRow(null, false), "top")
    assert.equal(resolveTotalRow("top", true), "top")
  })
  it("totalRow: keep 이면 원고 그대로", async () => {
    const [a, b, total] = await order(await markdownToHwpx(md, { gongmun: { preset: "보고서", totalRow: "keep" } }))
    assert.ok(a < b && b < total)
  })
})

describe("MCP lint_document", () => {
  let callback: any
  registerLintTools({ tool(name: string, ...args: any[]) { if (name === "lint_document") callback = args.at(-1) } } as any)

  it("text 검수 — 예산 켜면 산출근거 오류와 글자 위치", async () => {
    const res = await callback({ text: "회의 2025.1.6\n21,400원 × 1,400명 × 12월 = 359,600천원", budget: true })
    assert.ok(!res.isError, res.content[0].text)
    const r = JSON.parse(res.content[0].text)
    assert.equal(r.findings[0].rule, "DATE_NO_SPACE")
    assert.equal(r.findings[0].column, 4)
    assert.equal(r.budget[0].rule, "BUDGET_CALC_MISMATCH")
    assert.equal(r.budget[0].line, 2)
    assert.equal(r.summary.ok, false)
  })
  it("text·file_path 는 정확히 하나, 모르는 프리셋은 오류", async () => {
    assert.ok((await callback({})).isError)
    assert.ok((await callback({ text: "a", file_path: "b.hwpx" })).isError)
    assert.ok((await callback({ text: "a", preset: "없는프리셋" })).isError)
    assert.ok((await callback({ text: "a", preset: "constructor", gate: true })).isError, "프로토타입 키는 프리셋이 아님")
  })
  it("blocks 입력 — 지적마다 블록 id 와 블록 안 위치", async () => {
    const res = await callback({ blocks: [{ id: "p1", text: "회의 2026.1.6 개최" }, { id: "c1", text: "컨텐츠", table: { id: "t", row: 0, col: 0 } }] })
    assert.ok(!res.isError, res.content[0].text)
    const r = JSON.parse(res.content[0].text)
    assert.deepEqual(r.findings.map((f: { block: string; offset: number }) => [f.block, f.offset]), [["p1", 3], ["c1", 0]])
    assert.ok((await callback({ text: "a", blocks: [] })).isError, "입력은 셋 중 하나")
  })
  it("목록이 길면 잘라서 truncated 표시", async () => {
    const r = JSON.parse((await callback({ text: "회의 2025.1.6\n".repeat(800) })).content[0].text)
    assert.equal(r.findings.length, 500)
    assert.equal(r.truncated, true)
  })
})
