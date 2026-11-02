/**
 * kordoc 생성 문서의 장식표(제목 틀·장 띠·요약 상자·목차) 패치 — 파서는 그 표를 heading·인용문으로 내거나 건너뛰는데,
 * 소스맵이 그 칸 문단을 매핑 대상에 넣지 않고 표 서수에는 셌다. 그래서 제목·장 제목·요약이 "문단 소스맵 매핑 실패"로
 * 빠지고, 뒤의 데이터 표는 "표 개수 불일치"로 통째 막혔다 (보고서·계획서·개조식·업무보고·서울방침 프리셋).
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { markdownToHwpx } from "../src/hwpx/generator.js"
import { parseHwpxDocument } from "../src/hwpx/parser.js"
import { patchHwpx } from "../src/roundtrip/patcher.js"

const MD = "# 가온천 산책로 정비 계획\n\n> 산책로를 정비하고자 함\n\n## 추진 배경\n\n□ 민원 32건\n\n| 구분 | 수량 |\n| --- | --- |\n| 노면 | 1.2km |\n| 조명 | 20기 |\n\n## 추진 계획\n\n□ 노면 정비 1.2km\n"
const PRESETS = ["보고서", "계획서", "개조식", "업무보고", "서울방침"]

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
async function generated(preset: string, toc = false): Promise<Uint8Array> {
  return new Uint8Array(await markdownToHwpx(MD, { gongmun: { preset, toc } as never }))
}
const keep = async (b: Uint8Array) => (await parseHwpxDocument(ab(b), { layoutTables: "keep" })).markdown

describe("kordoc 장식표 패치", () => {
  for (const preset of PRESETS) {
    it(`${preset}: 제목 틀·장 띠·요약 상자·데이터 표 칸을 고친다`, async () => {
      const b = await generated(preset, preset === "개조식")
      const sk = await keep(b)
      const ed = sk
        .replace("가온천 산책로 정비 계획", "경로당 냉방기 교체 계획")
        .replace("추진 배경", "추진 경위")
        .replace("산책로를 정비하고자", "경로당을 정비하고자")
        .replace("20기", "30기")
      const r = await patchHwpx(b, ed, { structure: true })
      assert.equal(r.success, true)
      assert.deepEqual(r.skipped, [])
      assert.equal(r.applied, 4)
      const out = await keep(r.data!)
      for (const s of ["경로당 냉방기 교체 계획", "추진 경위", "경로당을 정비하고자", "30기"]) assert.ok(out.includes(s), `${s} 없음: ${out}`)
      assert.ok(!out.includes("가온천"))
    })
  }

  it("제목 바로 뒤에 늘린 문단은 제목 틀 밖 본문에 들어간다", async () => {
    const b = await generated("보고서")
    const ed = (await keep(b)).replace("# 가온천 산책로 정비 계획", "# 경로당 냉방기 교체 계획\n\n□ 새 항목")
    const r = await patchHwpx(b, ed, { structure: true })
    assert.deepEqual(r.skipped, [])
    const v = r.verification!.stats
    assert.equal(v.added + v.removed + v.modified, 0)
    const xml = await (await JSZip.loadAsync(r.data!)).file("Contents/section0.xml")!.async("string")
    const at = xml.indexOf("새 항목")
    assert.ok(xml.lastIndexOf("</hp:tbl>", at) > xml.lastIndexOf("<hp:tbl", at), "새 문단이 표 안에 들어감")
  })
})
