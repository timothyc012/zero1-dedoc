/** 윤문(AI 문체)·구성(논리 구조) 검수와 공문서 게이트 — 실결재·방침서 337건·보도자료 501건·AI 초안 24건 실측 기준 (docs/gongmun-logic.md) */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { lintSlopText } from "../src/hwpx/slop-lint.js"
import { lintLogicText, usesLogicStructure } from "../src/hwpx/logic-lint.js"
import { gongmunGate } from "../src/hwpx/gongmun-gate.js"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const slop = (t: string) => lintSlopText(t).map((f) => f.rule)
const logic = (t: string) => lintLogicText(t).map((f) => f.rule)

/** 설득 구조를 갖춘 원고 — 사실로 연 배경, 문제점마다 방안, 날짜·금액 있는 실행, 목표치 있는 기대효과 */
const GOOD = `# 상습 무단투기 지점 단속 개선방안 보고

> 상습 투기지점 42곳에 감시 장비와 야간 단속을 집중하여 무단투기 민원을 절반으로 줄이고자 함

## Ⅰ. 추진배경
- 최근 3년 무단투기 민원 1,240건(연 18%↑), 이 중 62%가 상습 지점 42곳에 집중
- 「폐기물관리법」 제68조 과태료 상향(2026. 3. 1. 시행)

## Ⅱ. 현황 및 문제점
- 단속반 4명이 주간만 순찰, 고정형 CCTV 31대
- (문제점)
  - 야간·휴일 단속 공백
  - 이동 투기지점 사각지대

## Ⅲ. 개선방안
- 야간·휴일 기동단속반 2개 조 편성
- 이동형 CCTV 12대를 사각지대 순환 배치

## Ⅳ. 추진일정 및 소요예산
- 2026. 11. 장비 구매, 12. 단속반 편성
- 총 84,000,000원(구비 100%)

## Ⅴ. 기대효과
- 상습 지점 민원 연 412건 → 200건(51%↓)
`

describe("윤문 검수 — 생성형 AI 문체", () => {
  it("사람 글에 없는 결산 접속어·평론 상투구는 error", () => {
    assert.ok(slop("ㅇ 결론적으로 단속 강화가 필요함").includes("SLOP_PIVOT"))
    const sig = lintSlopText("ㅇ 이번 조치는 시사하는 바가 큼")
    assert.equal(sig[0]?.rule, "SLOP_SIGNATURE")
    assert.equal(sig[0]?.severity, "error")
  })

  it("체감·만족도 상투구와 시대 상투 서두는 warning", () => {
    assert.ok(slop("- 구민 체감도 높은 생활환경 조성").includes("SLOP_FEEL_GOOD"))
    assert.ok(slop("- 급변하는 행정환경에 대응할 필요").includes("SLOP_ERA_CLICHE"))
  })

  it("번역투는 문서 안에서 3회 이상일 때만", () => {
    assert.ok(!slop("ㅇ 사업 추진에 있어서 협조 필요").includes("SLOP_TRANSLATIONESE"))
    assert.ok(slop("ㅇ 추진에 있어서\nㅇ 운영에 있어서\nㅇ 평가에 대해서").includes("SLOP_TRANSLATIONESE"))
  })

  it("숫자 없이 추상 성과로 끝나는 줄이 15% 이상이면 그 줄들을 짚는다", () => {
    const vague = ["협업 체계 구축", "행정 신뢰도 제고", "이용 편의 증진", "지역경제 활성화"].map((s) => `- ${s}`)
    const concrete = Array.from({ length: 8 }, (_, i) => `- 무더위쉼터 ${i + 10}곳 연장 운영`)
    const fs = lintSlopText([...vague, ...concrete].join("\n")).filter((f) => f.rule === "SLOP_VAGUE_OUTCOME")
    assert.equal(fs.length, 4)
    assert.equal(lintSlopText([vague[0], ...concrete].join("\n")).filter((f) => f.rule === "SLOP_VAGUE_OUTCOME").length, 0, "한 줄은 비율 미달")
  })

  it("코드펜스 안은 건너뛴다", () => {
    assert.equal(lintSlopText("```\n결론적으로\n```").length, 0)
  })
})

describe("구성 검수 — 왜 → 무엇 → 어떻게", () => {
  it("설득 구조를 갖춘 원고는 지적이 없다", () => {
    assert.deepEqual(logic(GOOD), [])
    assert.deepEqual(slop(GOOD), [])
  })

  it("장 이름을 서론·본론·결론으로 적으면 error", () => {
    const fs = lintLogicText("# 보고\n## 1. 서론\n- 배경\n## 2. 본론\n- 내용\n## 3. 결론\n- 정리")
    assert.equal(fs.filter((f) => f.rule === "LOGIC_ESSAY_HEADING").length, 3)
    assert.ok(fs.every((f) => f.severity === "error"))
  })

  it("방안부터 내밀고 왜(배경·근거·현황)가 없으면 error", () => {
    const md = "# 보고\n## Ⅰ. 개선방안\n- CCTV 12대 설치\n## Ⅱ. 추진일정\n- 2026. 11.\n## Ⅲ. 기대효과\n- 민원 30% 감소"
    const fs = lintLogicText(md)
    assert.ok(fs.some((f) => f.rule === "LOGIC_NO_WHY" && f.severity === "error"))
    assert.ok(fs.some((f) => f.rule === "LOGIC_UNGROUNDED"))
  })

  it("보고 목적 문장(…하고자 함)이 왜를 맡으면 배경 장이 없어도 통과", () => {
    const md = "# 계획\n민선9기 시정 기본방향을 정립하고자 함\n## 1. 추진방향\n- 공약 145개 과제화\n## 2. 추진체계\n- 2026. 6.∼8.\n## 3. 세부 추진계획\n- 분과 7개"
    assert.ok(!logic(md).includes("LOGIC_NO_WHY"))
  })

  it("개요·결과 장만 있는 결과보고는 제안이 아니라 왜를 묻지 않는다", () => {
    const md = "# 결과보고\n## Ⅰ. 개최개요\n- 2026. 6. 3.\n## Ⅱ. 개최결과\n- 3개사 평가\n## Ⅲ. 행정사항\n- 붙임 참조"
    assert.ok(!logic(md).includes("LOGIC_NO_WHY"))
  })

  it("실행(일정·예산) 장이 없으면 warning", () => {
    const md = "# 보고\n## 1. 추진배경\n- 민원 412건\n## 2. 현황\n- CCTV 31대\n## 3. 개선방안\n- 기동단속반 편성"
    assert.ok(logic(md).includes("LOGIC_NO_HOW"))
  })

  it("배경·현황이 사실(수치·법령·날짜) 없이 분위기뿐이면 warning, 자리표시(○○)는 사실 자리로 친다", () => {
    const vague = "# 보고\n## 1. 추진배경\n- 주민 불편 지속\n## 2. 개선방안\n- 단속 강화\n## 3. 추진일정\n- 2026. 11."
    assert.ok(logic(vague).includes("LOGIC_BASIS_NO_FACT"))
    assert.ok(!logic(vague.replace("주민 불편 지속", "민원 ○○건 접수")).includes("LOGIC_BASIS_NO_FACT"))
  })

  it("문제점마다 대응 방안을 찾고, 짝 없는 문제점을 짚는다", () => {
    const md = GOOD.replace("- 이동형 CCTV 12대를 사각지대 순환 배치", "- 단속 표준 절차 정비")
    const fs = lintLogicText(md).filter((f) => f.rule === "LOGIC_PROBLEM_UNANSWERED")
    assert.deepEqual(fs.map((f) => f.match), ["이동 투기지점 사각지대"])
  })

  it("표의 '문제점' 칸도 문제 항목으로 본다", () => {
    const md = "# 보고\n## 1. 추진배경\n- 민원 412건\n## 2. 현황 및 문제점\n| 구분 | 현황 | 문제점 |\n|---|---|---|\n| 인력 | 4명 | 야간 공백 |\n| 장비 | CCTV 31대 | 보관창고 협소 |\n## 3. 개선방안\n- 야간 단속반 편성\n## 4. 추진일정\n- 2026. 11."
    assert.deepEqual(lintLogicText(md).filter((f) => f.rule === "LOGIC_PROBLEM_UNANSWERED").map((f) => f.match), ["보관창고 협소"])
  })

  it("기대효과에 목표치가 없으면 warning", () => {
    assert.ok(logic(GOOD.replace("- 상습 지점 민원 연 412건 → 200건(51%↓)", "- 주민 만족도 향상")).includes("LOGIC_EFFECT_VAGUE"))
  })

  it("왜가 방안 뒤에 오면 순서를 짚는다 — 첫 장 '추진개요'는 제안이 아니라 순서 판정 밖", () => {
    const md = "# 보고\n## 1. 개선방안\n- 단속반 2개 조\n## 2. 추진배경\n- 민원 412건\n## 3. 추진일정\n- 2026. 11."
    assert.ok(logic(md).includes("LOGIC_ORDER"))
    const lead = "# 보고\n## 1. 추진개요\n- 기간 2026. 11.\n## 2. 현황 및 문제점\n- 민원 412건\n## 3. 개선방안\n- 단속반\n## 4. 추진일정\n- 2026. 12."
    assert.ok(!logic(lead).includes("LOGIC_ORDER"))
  })

  it("보고서·계획서 계열 프리셋만 구성 검수 대상", () => {
    assert.ok(usesLogicStructure("보고서") && usesLogicStructure("계획서") && usesLogicStructure("서울방침"))
    assert.ok(!usesLogicStructure("기안문") && !usesLogicStructure("보도자료") && !usesLogicStructure("회의록"))
  })
})

describe("공문서 게이트", () => {
  it("설득 구조·담백한 문체면 통과", () => {
    assert.equal(gongmunGate(GOOD, { preset: "보고서" }).pass, true)
  })

  it("윤문·구성 경고도 막는다 — 표기법 경고는 참고로만", () => {
    const g = gongmunGate(GOOD.replace("(51%↓)", "(51%↓)\n- 구민 체감도 높은 생활환경"), { preset: "보고서" })
    assert.equal(g.pass, false)
    assert.deepEqual(g.blocking.map((f) => f.axis + ":" + f.rule), ["윤문:SLOP_FEEL_GOOD"])
    const date = gongmunGate(GOOD.replace("2026. 11. 장비", "2026-11-02 장비"), { preset: "보고서" })
    assert.equal(date.pass, true, "하이픈 날짜(DATE_HYPHEN)는 표기법 경고 — 막지 않음")
    assert.ok(date.advisory.some((f) => f.rule === "DATE_HYPHEN"))
  })

  it("기안문 프리셋은 구성 검수를 돌리지 않는다", () => {
    const md = "## 1. 개선방안\n- 단속반 편성\n## 2. 세부내용\n- 장비 구매\n## 3. 추진일정\n- 협의 후 결정"
    assert.ok(gongmunGate(md, { preset: "보고서" }).blocking.some((f) => f.axis === "구성"))
    assert.ok(!gongmunGate(md, { preset: "기안문" }).blocking.some((f) => f.axis === "구성"))
  })

  it("긴 입력에서 정규식이 폭주하지 않는다", () => {
    for (const s of [" ".repeat(50000) + "x", "- " + "강화 ".repeat(20000), "## " + "가".repeat(50000), "|".repeat(50000), "이는 ".repeat(20000)]) {
      const t = performance.now()
      gongmunGate(s, { preset: "보고서" })
      assert.ok(performance.now() - t < 1500, `${s.slice(0, 10)} ${(performance.now() - t).toFixed(0)}ms`)
    }
  })
})

describe("게이트 CLI — lint --gate·generate --gate", () => {
  const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
  const run = (args: string[], input: string) =>
    spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { encoding: "utf-8", input, timeout: 60000 })
  const BAD = GOOD.replace("## Ⅰ. 추진배경", "## Ⅰ. 서론")

  it("lint --gate 는 윤문·구성 지적에서 exit 1, 고친 원고는 exit 0", () => {
    const bad = run(["lint", "-", "--gate", "--preset", "보고서", "--json"], BAD)
    assert.equal(bad.status, 1, bad.stderr)
    const out = JSON.parse(bad.stdout)
    assert.equal(out.summary.gate, false)
    assert.ok(out.logic.some((f: { rule: string }) => f.rule === "LOGIC_ESSAY_HEADING"))
    assert.equal(run(["lint", "-", "--gate", "--preset", "보고서"], GOOD).status, 0)
  })

  it("lint 기본 동작은 종전대로 — 윤문·구성 경고는 옵트인", () => {
    const r = run(["lint", "-"], GOOD.replace("(51%↓)", "(51%↓)\n- 구민 체감도 높은 생활환경"))
    assert.equal(r.status, 0)
    assert.doesNotMatch(r.stderr, /윤문 검수/)
  })

  it("generate --gate 는 미통과면 파일을 만들지 않는다", () => {
    const dir = mkdtempSync(join(tmpdir(), "kordoc-gate-"))
    try {
      const out = join(dir, "a.hwpx")
      const bad = run(["generate", "-", "-o", out, "--preset", "보고서", "--gate"], BAD)
      assert.equal(bad.status, 1)
      assert.match(bad.stderr, /게이트 미통과/)
      assert.equal(existsSync(out), false)
      const good = run(["generate", "-", "-o", out, "--preset", "보고서", "--gate"], GOOD)
      assert.equal(good.status, 0, good.stderr)
      assert.equal(existsSync(out), true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
