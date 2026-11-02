/**
 * 채운 칸 좌표 (#145) — FormField.target 과 fill --dry-run 대상 칸 출력.
 *  1. target(표 번호·격자 행·열)이 가리키는 칸에 그 값이 실제로 들어 있다 — 원본 보존·markdown 두 경로
 *  2. fill --dry-run 에 값을 주면 쓰지 않고 키·배열 번호별 대상 칸을 JSON 으로 낸다. 같은 칸을 나중 키가 덮으면 overwrittenBy
 *  3. 필드 인식은 행 머리 옆 하위 라벨("신청인 | 상호 또는 법인명칭")을 필드로 내지 않는다 — 채우기가 그 칸에 쓰지 않으므로
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { markdownToHwpx, parse, fillForm, fillFormFields, extractFormFields } from "../src/index.js"
import { fillPlan } from "../src/form/match.js"
import type { IRBlock, IRTable } from "../src/types.js"

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const BID_FORM = [
  "입찰참가신청서", "",
  "<table>\n<tr><td rowspan=\"2\">신청인</td><td>상호 또는 법인명칭</td><td></td></tr>\n<tr><td>대표자</td><td></td></tr>\n</table>", "",
  "위임장", "",
  "<table>\n<tr><td rowspan=\"2\">대표자</td><td>성 명</td><td></td></tr>\n<tr><td>주 소</td><td></td></tr>\n</table>", "",
  "회사 일반현황", "",
  "<table>\n<tr><td>회사명</td><td></td><td>대표자</td><td></td></tr>\n<tr><td>주소</td><td colspan=\"3\"></td></tr>\n</table>", "",
].join("\n")
const VALUES = { 성명: ["S0"], 대표자: ["D0", "D1"], 회사명: "곰돌이", 주소: "서울" }

const tablesOf = (blocks: IRBlock[]): IRTable[] => {
  const out: IRTable[] = []
  const walk = (bs: IRBlock[]) => { for (const b of bs) if (b.table) { out.push(b.table); for (const row of b.table.cells) for (const c of row) if (c.blocks) walk(c.blocks) } }
  walk(blocks)
  return out
}

describe("채운 칸 좌표 (#145)", () => {
  it("target 칸에 그 값이 들어 있다 — 두 경로", async () => {
    const doc = Buffer.from(await markdownToHwpx(BID_FORM))
    const kept = await parse(doc, { layoutTables: "keep", keepTrailingEmptyCols: true })
    assert.ok(kept.success)
    const md = fillFormFields(kept.blocks, VALUES)
    const h = await fillForm(doc, VALUES, "hwpx-preserve")
    const re = await parse(Buffer.from(h.output as ArrayBuffer), { layoutTables: "keep", keepTrailingEmptyCols: true })
    assert.ok(re.success)
    for (const [name, tables, filled] of [["markdown", tablesOf(md.blocks), md.filled], ["hwpx-preserve", tablesOf(re.blocks), h.fill.filled]] as const) {
      assert.equal(filled.length, 6, name)
      for (const f of filled) {
        assert.ok(f.target, `${name} ${f.label}`)
        assert.equal(tables[f.target.table].cells[f.target.row][f.target.col].text, f.value, `${name} ${f.label}=${f.value}`)
      }
    }
  })

  it("fill --dry-run 은 쓰지 않고 키·배열 번호별 대상 칸을 낸다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kordoc-fill-plan-"))
    try {
      const form = join(dir, "form.hwpx"), values = join(dir, "values.json")
      writeFileSync(form, Buffer.from(await markdownToHwpx(BID_FORM)))
      const before = readFileSync(form)
      writeFileSync(values, JSON.stringify(VALUES))
      const r = spawnSync(process.execPath, ["--import", "tsx", CLI, "fill", form, "-j", values, "--dry-run", "--silent"], { encoding: "utf-8", timeout: 60000 })
      assert.equal(r.status, 0, r.stderr)
      assert.ok(readFileSync(form).equals(before), "원본을 건드리지 않는다")
      const plan = JSON.parse(r.stdout) as ReturnType<typeof fillPlan>
      const d = plan.targets.filter(t => t.key === "대표자")
      assert.deepEqual(d.map(t => [t.index, t.value, t.target]), [[0, "D0", { table: 0, row: 1, col: 2 }], [1, "D1", { table: 2, row: 0, col: 3 }]])
      assert.deepEqual(plan.targets.find(t => t.value === "S0")?.target, { table: 1, row: 0, col: 2 })
      assert.deepEqual(plan.unmatched, [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("같은 칸을 나중 키가 다시 쓰면 overwrittenBy 로, 입력 키 이름으로 알린다", () => {
    const at = { table: 0, row: 1, col: 1 }
    const plan = fillPlan({ "합 계": "1", 소계: ["2"] }, [
      { label: "합 계", value: "1", row: 1, col: 0, key: "합계", target: at },
      { label: "소계", value: "2", row: 1, col: 0, key: "소계", target: { ...at } },
      { label: "비고", value: "3", row: -1, col: -1, key: "비고" },
    ], ["없는키"], [])
    assert.deepEqual(plan.targets.map(t => [t.key, t.index, t.overwrittenBy]), [["합 계", 0, "소계"], ["소계", 0, undefined], ["비고", 0, undefined]])
    assert.equal(plan.targets[2].target, null)
    assert.deepEqual(plan.unmatched, ["없는키"])
  })

  it("필드 인식은 행 머리 옆 하위 라벨을 필드로 내지 않는다", async () => {
    const r = await parse(Buffer.from(await markdownToHwpx(BID_FORM)), { layoutTables: "keep", keepTrailingEmptyCols: true })
    assert.ok(r.success)
    const labels = extractFormFields(r.blocks).fields.map(f => f.label)
    assert.ok(!labels.includes("신청인"))
    assert.ok(labels.includes("상호 또는 법인명칭") && labels.includes("성 명"))
  })
})
