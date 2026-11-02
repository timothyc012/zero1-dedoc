/** 예산 문서 검수·합계 행 위치·검수 글자 위치 (구청 예산편성 보고서 실무 지적 2026-10) */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { lintBudgetText } from "../src/hwpx/budget-lint.js"
import { lintGongmunText } from "../src/hwpx/gongmun-lint.js"
import { runLintSuite } from "../src/hwpx/lint-suite.js"
import { placeTotalRow } from "../src/hwpx/gen-table.js"

const rules = (t: string) => lintBudgetText(t).map((f) => f.rule)
const fast = (label: string, fn: () => unknown): void => {
  const t = performance.now()
  fn()
  const ms = performance.now() - t
  assert.ok(ms < 1000, `${label} ${ms.toFixed(0)}ms`)
}

describe("예산 검수 — 산출근거 검산", () => {
  it("단가 × 수량 × 기간 이 적은 금액과 다르면 바른 금액을 제안", () => {
    const [f] = lintBudgetText("○ 산출내역: 21,400원 × 1,400명 × 12월 = 359,600천원 (행안부 단가)")
    assert.equal(f.rule, "BUDGET_CALC_MISMATCH")
    assert.equal(f.severity, "error")
    assert.match(f.suggest!, /= 359,520천원$/)
    assert.equal(f.column, "○ 산출내역: ".length + 1)
  })
  it("맞으면 무위반 — 단위 아래 끝수(반올림·절사)는 허용", () => {
    assert.deepEqual(rules("21,400원 × 1,400명 × 12월 = 359,520천원"), [])
    assert.deepEqual(rules("15,555원 × 3개 = 46천원"), [], "46.665천원 → 46(절사)")
    assert.deepEqual(rules("15,555원 × 3개 = 47천원"), [], "46.665천원 → 47(반올림)")
  })
  it("비율·천원 단가도 계산", () => {
    assert.deepEqual(rules("300,000천원 × 15% = 45,000천원"), [])
    assert.deepEqual(rules("300,000천원 × 15% = 40,000천원"), ["BUDGET_CALC_MISMATCH"])
  })
  it("금액 인자가 없는 곱(인원 × 횟수)은 단위를 몰라 판정하지 않음", () => {
    assert.deepEqual(rules("10명 × 3회 = 50원"), [])
  })
})

describe("예산 검수 — 표 합계", () => {
  const table = (rows: string[]) => ["| 구분 | 금액 | 비고 |", "|---|---:|---|", ...rows].join("\n")
  it("합계가 항목 합과 다르면 error, 바른 합계 제안", () => {
    const fs = lintBudgetText(table(["| 합계 | 699,600 | |", "| 이용료 | 361,200 | 견적 |", "| 구축비 | 333,600 | |"]))
    const m = fs.find((f) => f.rule === "BUDGET_TOTAL_MISMATCH")
    assert.ok(m)
    assert.match(m!.suggest!, /→ 694,800$/)
  })
  it("맞으면 무위반, 글이 섞인 열(비고)은 합계 대상 아님", () => {
    assert.deepEqual(rules(table(["| 계 | 694,800 | |", "| 이용료 | 361,200 | 견적 |", "| 구축비 | 333,600 | 단가 |"])), [])
  })
  it("소계가 있으면 합계 = 소계들의 합", () => {
    const t = table(["| 합계 | 300 | |", "| 소계 | 100 | |", "| 가 | 100 | |", "| 소계 | 200 | |", "| 나 | 150 | |", "| 다 | 50 | |"])
    assert.deepEqual(rules(t), [])
  })
  it("합계 행이 맨 아래면 위치 경고(머리행 바로 아래가 관행)", () => {
    assert.deepEqual(rules(table(["| 이용료 | 100 | |", "| 구축비 | 200 | |", "| 합계 | 300 | |"])), ["BUDGET_TOTAL_POSITION"])
  })
  it("△ 는 감소(음수)", () => {
    assert.deepEqual(rules(table(["| 계 | 700 | |", "| 증액 | 1,000 | |", "| 감액 | △300 | |"])), [])
  })
})

describe("예산 검수 — 외화·증감 기준", () => {
  it("$·USD 대신 '달러', 원화를 앞에", () => {
    assert.ok(rules("API 이용료 월 $3.1").includes("BUDGET_CURRENCY_SYMBOL"))
    assert.ok(rules("월 약 3.1달러 소요").includes("BUDGET_WON_FIRST"))
    assert.ok(!rules("월 약 4,200원(약 3.1달러) 소요\n※ 환율 1,330원/달러 기준").includes("BUDGET_WON_FIRST"))
  })
  it("달러 금액이 있는데 환율 기준이 없으면 문서 단위 경고", () => {
    assert.ok(rules("월 약 4,200원(약 3.1달러)").includes("BUDGET_RATE_MISSING"))
    assert.ok(!rules("월 약 4,200원(약 3.1달러)\n- 환율 1,330원/달러('26. 10. 20. 기준)").includes("BUDGET_RATE_MISSING"))
  })
  it("증감 기준(본예산/최종예산)이 없으면 경고", () => {
    assert.ok(rules("○ 예산(안): 699,600천원 (2026년 대비 5,000천원 증)").includes("BUDGET_BASIS_UNCLEAR"))
    assert.deepEqual(rules("○ 예산(안): 699,600천원 (2026년 본예산 대비 5,000천원 증)"), [])
  })
  it("긴 숫자 줄에서 폭주하지 않음", () => {
    fast("숫자", () => lintBudgetText("1".repeat(50000) + " × 2 = 3원"))
    fast("쉼표", () => lintBudgetText("1,".repeat(25000) + "달러"))
    fast("표", () => lintBudgetText(["| 계 | 1 |", "|---|---|", ...Array.from({ length: 5000 }, () => "| a | 1 |")].join("\n")))
    // 보안 리뷰 최악 입력(2026-10-21) — 공백 사슬·곱셈 사슬·구분 줄·달러 반복·거대 표·지적 폭증
    fast("공백 사슬", () => lintBudgetText("1" + " ".repeat(100000)))
    fast("곱셈 사슬", () => lintBudgetText("1×".repeat(100000)))
    fast("구분 줄", () => lintBudgetText(" ".repeat(200000) + "|x"))
    fast("달러 반복", () => lintBudgetText("1달러 ".repeat(100000)))
    fast("거대 표", () => lintBudgetText("|h|\n|합계|" + "1|".repeat(300000) + "\n" + "|a|\n".repeat(50000)))
    assert.ok(lintBudgetText("$1 ".repeat(300000)).length <= 1000, "지적 상한")
  })
})

describe("표기법 검수 보강", () => {
  it("지적마다 1부터 센 글자 위치(column)", () => {
    const [f] = lintGongmunText("회의는 2025.1.6 에 연다")
    assert.equal(f.rule, "DATE_NO_SPACE")
    assert.equal(f.column, "회의는 ".length + 1)
    assert.equal(f.match, "2025.1.6")
  })
  it("쉼표를 둔 수 뒤 '천원'은 예산서 단위 표기 — 줄임말 아님", () => {
    assert.ok(!lintGongmunText("예산 359,600천원").some((f) => f.rule === "MONEY_CHEONWON"))
    assert.ok(lintGongmunText("참가비 3천원").some((f) => f.rule === "MONEY_CHEONWON"))
  })
})

describe("정확성 리뷰 회귀(2026-10-21)", () => {
  const table = (head: string, rows: string[]) => [head, "|---|---:|---:|", ...rows].join("\n")
  it("더하기가 섞인 산출근거의 뒷부분만 떼어 판정하지 않음", () => {
    assert.deepEqual(rules("강사수당: 400,000원 × 2명 + 200,000원 × 3명 = 1,400천원"), [])
    assert.deepEqual(rules("1원 × 1 × 1 × 1 × 1 × 1 × 1 × 1 × 1 × 1 × 1 = 5원"), [], "곱 인자 10개 넘는 식은 판정 밖")
  })
  it("합계 칸의 '-'(해당 없음)·비율·단가 열은 합계 대상 아님", () => {
    assert.deepEqual(rules(table("| 구분 | 단가 | 수량 |", ["| 계 | - | 30 |", "| 가 | 50 | 10 |", "| 나 | 50 | 20 |"])), [])
    assert.deepEqual(rules(table("| 구분 | 예산 | 증감률(%) |", ["| 계 | 300 | 10.0 |", "| 가 | 100 | 8.0 |", "| 나 | 200 | 12.0 |"])), [])
  })
  it("소수 금액은 적은 자릿수로 허용 오차", () => {
    assert.deepEqual(rules("1억원 × 1.5 = 1.9억원"), ["BUDGET_CALC_MISMATCH"])
    assert.deepEqual(rules("1억원 × 1.5 = 1.5억원"), [])
  })
  it("대시 1개 구분 줄, 표 안 환율, 코드 펜스", () => {
    assert.deepEqual(rules(["| 구분 | 금액 |", "|-|-|", "| 계 | 3 |", "| 가 | 1 |", "| 나 | 2 |"].join("\n")), [])
    assert.ok(!rules("월 약 4,200원(약 3.1달러)\n\n| 환율 | 1,330원 |\n|---|---|").includes("BUDGET_RATE_MISSING"))
    assert.deepEqual(rules("```\n21,400원 × 1,400명 × 12월 = 359,600천원\n```"), [])
  })
  it("표 지적의 column 은 그 칸 글자 위치", () => {
    const line = "| 합계 | 699,600 |"
    const f = lintBudgetText(["| 구분 | 금액 |", "|---|---:|", line, "| 가 | 1 |"].join("\n")).find((x) => x.rule === "BUDGET_TOTAL_MISMATCH")!
    assert.equal(f.column, line.indexOf("699,600") + 1)
  })
  it("공공언어·맞춤법 낱말표 — 어절 경계와 조사", () => {
    const rule = (t: string) => lintGongmunText(t).map((f) => f.rule)
    assert.ok(rule("금년 사업은").includes("PLAIN_LANGUAGE"))
    assert.ok(rule("자료 송부 요청").includes("PLAIN_LANGUAGE"))
    assert.ok(!rule("자료를 송부하오니").includes("PLAIN_LANGUAGE"), "활용형은 다른 어절")
    assert.ok(!rule("금113,560원(금일십일만삼천오백육십원)").includes("PLAIN_LANGUAGE"), "한글 금액 속 '금일'")
    assert.ok(rule("담당 역활을").includes("SPELLING_ERROR"))
    assert.ok(rule("깨끗히 정리").includes("SPELLING_ERROR"))
    assert.ok(!rule("금새 해결").includes("SPELLING_ERROR"), "다른 낱말이기도 한 꼴은 제외")
  })
  it("두 자리 연도는 일정 줄(탭·점선·두 칸 뒤 날짜)만 허용", () => {
    const yr = (t: string) => lintGongmunText(t).filter((f) => f.rule === "DATE_2DIGIT_YR")
    assert.equal(yr("○ 운영 서버 API 키 등록 및 배포 ········ '26. 10.").length, 0)
    assert.equal(yr("○ 언론팀 시범 사용\t'26. 10.~11.").length, 0)
    assert.equal(yr("- 재현율 지속 개선  '26. 11.~").length, 0)
    const [f] = yr("'26. 10. 시행 예정")
    assert.ok(f, "일정 줄이 아니면 그대로 위반")
    assert.equal(f.suggest, "예) 2025. 1. 6.")
    assert.equal(yr("※ 환율 1,330원/달러('26. 10. 20. 기준)").length, 1)
  })
  it("쉼표 없는 '1500천원' 은 다시 잡는다", () => {
    assert.ok(lintGongmunText("예산 1500천원").some((f) => f.rule === "MONEY_CHEONWON"))
  })
})

describe("검수 묶음(runLintSuite)", () => {
  it("budget 을 켜야 예산 지적이 나오고 error 는 ok=false", () => {
    const text = "21,400원 × 1,400명 × 12월 = 359,600천원"
    assert.equal(runLintSuite(text).budget, undefined)
    const r = runLintSuite(text, { budget: true })
    assert.equal(r.budget?.[0].rule, "BUDGET_CALC_MISMATCH")
    assert.equal(r.summary.ok, false)
    assert.equal(r.summary.errors, 1)
  })
})

describe("합계 행 위치(placeTotalRow)", () => {
  const rows = [["구분", "금액"], ["가", "1"], ["나", "2"], ["합계", "3"]]
  it("top: 머리행 바로 아래로", () => {
    assert.deepEqual(placeTotalRow(rows, "top").map((r) => r[0]), ["구분", "합계", "가", "나"])
  })
  it("bottom·keep", () => {
    assert.deepEqual(placeTotalRow(placeTotalRow(rows, "top"), "bottom").map((r) => r[0]), ["구분", "가", "나", "합계"])
    assert.equal(placeTotalRow(rows, "keep"), rows)
  })
  it("굵게 표기한 **계** 도 합계로 보고, 합계가 둘이면 건드리지 않음", () => {
    assert.deepEqual(placeTotalRow([["구분", "금액"], ["가", "1"], ["**계**", "1"]], "top").map((r) => r[0]), ["구분", "**계**", "가"])
    const two = [["구분", "금액"], ["계", "1"], ["가", "1"], ["합계", "1"]]
    assert.equal(placeTotalRow(two, "top"), two)
  })
  it("소계는 옮기지 않음", () => {
    const sub = [["구분", "금액"], ["가", "1"], ["소계", "1"]]
    assert.equal(placeTotalRow(sub, "top"), sub)
  })
})

describe("실기 시험 반영(2026-10-21)", () => {
  it("산출근거 곱셈 줄·표 칸의 천원은 단위 표기 — 줄임말로 잡지 않음", () => {
    assert.ok(!lintGongmunText("- 강사료 500,000원 × 2명 × 1회 = 900천원").some((f) => f.rule === "MONEY_CHEONWON"))
    assert.ok(!lintGongmunText("| 강사료 | 900천원 |").some((f) => f.rule === "MONEY_CHEONWON"))
    assert.ok(lintGongmunText("참가비 900천원을 받는다").some((f) => f.rule === "MONEY_CHEONWON"))
  })
  it("산출근거 검산 제안은 '원래 식 → 바른 식' 꼴(바로 바꿔 넣기)", () => {
    const [f] = lintBudgetText("- 강사료 500,000원 × 2명 × 1회 = 900천원")
    assert.equal(f.suggest, "500,000원 × 2명 × 1회 = 900천원 → 500,000원 × 2명 × 1회 = 1,000천원")
    assert.equal(f.match, "500,000원 × 2명 × 1회 = 900천원")
  })
})

describe("리뷰 반영(2026-10-21)", () => {
  it("줄 앞 목록 부호·꼬리표 뒤 식도 검산 — 연산자 앞에 피연산자가 있을 때만 긴 식의 뒷부분", () => {
    assert.ok(rules("- 200,000원 × 2회 = 500,000원").includes("BUDGET_CALC_MISMATCH"))
    assert.ok(rules("(산출근거) 200,000원 × 2회 = 500,000원").includes("BUDGET_CALC_MISMATCH"))
    assert.ok(!rules("400,000원 × 2명 + 200,000원 × 3명 = 1,400,000원").includes("BUDGET_CALC_MISMATCH"))
  })
  it("소계(A)·소계(B) 가 있으면 합계 = 소계들의 합, 구성비 행은 더하지 않음", () => {
    const sub = "| 구분 | 금액 |\n|---|---|\n| 합계 | 300 |\n| 소계(A) | 100 |\n| 가 | 100 |\n| 소계(B) | 200 |\n| 나 | 200 |"
    assert.deepEqual(rules(sub), [])
    assert.ok(rules(sub.replace("| 합계 | 300 |", "| 합계 | 310 |")).includes("BUDGET_TOTAL_MISMATCH"))
    const ratio = "| 구분 | 2025 |\n|---|---|\n| 합계 | 300 |\n| 가 | 100 |\n| 나 | 200 |\n| 구성비 | 100 |"
    assert.deepEqual(rules(ratio), [])
  })
  it("천원이 수만 번 나오는 긴 줄도 선형", () => {
    fast("천원 반복 20만 자", () => lintGongmunText("1천원 ".repeat(40000)))
  })
})

describe("리뷰 반영 회귀(2026-10-21)", () => {
  it("긴 식의 뒷부분은 여전히 건너뜀 — 줄 첫머리 +·×, 넓은 공백, 라틴·기호 단위, 전각 괄호", () => {
    for (const t of [
      "+ 200,000원 × 3명 = 1,400,000원",
      "× 200,000원 × 3명 = 1,800,000원",
      "1,000원 × 2명    + 3,000원 × 2명 = 8,000원",
      "5,000원 × 10EA + 2,000원 × 5 = 60,000원",
      "1,000원 × 3㎡ + 2,000원 × 5 = 13,000원",
      "（1,000원 × 2명）+ 500원 × 2명 = 3,000원",
    ]) assert.ok(!rules(t).includes("BUDGET_CALC_MISMATCH"), t)
  })
  it("효율·법률·국비 50% 같은 항목 행은 합계에 더함", () => {
    for (const name of ["효율", "법률", "국비 50%"]) {
      const t = `| 구분 | 금액 |\n|---|---|\n| 합계 | 300 |\n| ${name} | 100 |\n| 기타 | 200 |`
      assert.deepEqual(rules(t), [], name)
    }
  })
})
