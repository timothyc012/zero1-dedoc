import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
// 줄 열 개(0·1600·…·14400)를 담은 칸 하나짜리 칸 안 나눔 표, 바깥 위 여백 141
const table = () => {
  const ls = Array.from({ length: 10 }, (_, i) => `<hp:lineseg textpos="0" vertpos="${i * 1600}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`).join("")
  return createXmlParser().parseFromString(`<hp:tbl ${hp} pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="1000"/><hp:outMargin left="0" right="0" top="141" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${ls}</hp:linesegarray></hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element
}

describe("render: 갈린 칸 안 표의 이어진 쪽", () => {
  it("바깥 칸 내용 위(contMT)에서 다시 시작한다 — 본문 위가 아니다", async () => {
    const { planTableRows } = await import("../src/render/table-pages.js")
    const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
    const t = table()
    const plan = (contMT?: number) => planTableRows(t, collectCells(t), measureTableRowHeights(t), 141, 0, 7000, 0, undefined, true, contMT)[0]
    // 바깥 표 여백 141 + 바깥 칸 위 여백 283 = 424 아래에서 안쪽 표 바깥 위 여백 141 만큼 — 이어진 쪽 조각은 565 에서
    const inCell = plan(424)
    assert.deepEqual(inCell.slice(1).map(p => p.y), inCell.slice(1).map(() => 565))
    assert.ok(inCell.every(p => p.page === 0 || p.y + p.h <= 7000 || p === inCell[inCell.length - 1]))
    // contMT 를 안 주면 종전처럼 본문 위 + 표 바깥 위 여백
    assert.deepEqual(plan().slice(1).map(p => p.y), plan().slice(1).map(() => 141))
  })
})
