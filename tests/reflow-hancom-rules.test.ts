/**
 * reflow 한컴 조판 규칙 — 한컴 저장본·PDF 와 대조해 확인한 규칙.
 *  1. 글자 폭은 글자마다 4 HWPUNIT 단위(hancomCharWidth) — 공백은 4·⌊크기/8⌋, 자간은 ⌊폭/4⌋ 의 %를 4 단위로
 *  2. 폭표 없는 한글 글꼴은 한글 1em(faceClassForReflow) — 함초롬만 함초롬 폭, 옛 HFT 명조·고딕은 고정폭
 *  3. KoPub 바탕·돋움 실측 폭표(한글 0.936em·0.872em, 굵기끼리 같음)
 *  4. 공백 최소값(condense): 줄 가용폭 + 그 줄 공백 폭 합 × condense%
 *  5. 한컴 기본 금칙 집합 — 닫는 작은따옴표(’)는 줄머리 금지
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { hancomCharWidth, faceClassForReflow, simulateWrap, syntheticBoldEm } from "../src/hwpx/text-metrics.js"
import { fontAdvanceEm1000 } from "../src/hwpx/font-metrics.js"

describe("reflow 한컴 조판 규칙", () => {
  it("글자 폭은 글자마다 4 단위로 양자화한다", () => {
    assert.equal(hancomCharWidth("가", 1000, 100, 0, "hcr"), 972) // 4·MulDiv(970, 250, 1000) — 실수 폭 970
    assert.equal(hancomCharWidth(" ", 1100, 100, 0, "hcr"), 548) // 4·⌊1100/8⌋ — 0.5em(550) 이 아니다
    assert.equal(hancomCharWidth("가", 1300, 98, -2, "fixedPitch"), 1248) // 4·⌊1000·325·98/10⁵⌋ = 1272, 자간 4·MulDiv(318, −2, 100) = −24
    for (const [ch, h] of [["가", 1000], ["A", 1100], [" ", 1300]] as const) assert.equal(hancomCharWidth(ch, h, 100, 0, "hcr") % 4, 0)
  })

  it("폭표 없는 한글 글꼴은 한글 1em, 함초롬은 함초롬 폭, 명조·고딕은 고정폭", () => {
    assert.equal(faceClassForReflow("HY엽서M"), "cjk")
    assert.equal(faceClassForReflow("신명조"), "cjk")
    assert.equal(faceClassForReflow("바탕"), "font:바탕") // 한컴 저장본 맞춤 폭표
    assert.equal(faceClassForReflow("명조"), "fixedPitch") // 옛 HFT 기본 글꼴은 고정폭
    assert.equal(faceClassForReflow("고딕"), "font:고딕") // 고정폭 표 + ‘’“” 반각
    assert.deepEqual(["A", "가", "‘"].map(c => fontAdvanceEm1000("고딕", c.codePointAt(0)!)), [500, 1000, 500])
    // 반각 낫표 ｢｣ 는 한양신명조·휴먼명조에서도 반각 짝 — 여는 쪽만 좁으면 「선박…」 든 줄이 한 글자 일찍 넘어간다
    for (const f of ["한양신명조", "휴먼명조"]) assert.deepEqual(["｢", "｣"].map(c => fontAdvanceEm1000(f, c.codePointAt(0)!)), [500, 500])
    assert.equal(faceClassForReflow("함초롬바탕"), "hcr")
    assert.equal(faceClassForReflow("HCR Batang"), "hcr") // 영문 이름도 같은 글꼴
    assert.equal(faceClassForReflow("Haansoft Batang"), "font:한컴바탕")
    assert.equal(faceClassForReflow("Haansoft Dotum"), "font:한컴돋움")
    assert.equal(faceClassForReflow("돋움체"), "font:돋움체") // 굴림체와 같은 폭표
    assert.equal(faceClassForReflow("바탕체"), "fixedPitch")
    assert.equal(faceClassForReflow("KoPub바탕체 Light"), "font:KoPub바탕체 Light")
    assert.equal(hancomCharWidth("가", 1000, 100, 0, "cjk"), 1000)
    assert.equal(hancomCharWidth("A", 1000, 100, 0, "cjk"), hancomCharWidth("A", 1000, 100, 0, "hcr"))
  })

  it("반각 형태(｢ ｣ ･)는 표에 따로 없으면 반각, 옛한글 조합 자모는 한 글자 폭", () => {
    for (const fc of ["cjk", "fixedPitch", "hcr", "font:HY견고딕"] as const) assert.equal(hancomCharWidth("｢", 1000, 100, 0, fc), 500, fc)
    // ᄒ+ᆞ+ᆫ 세 자모가 한 글자 — 41자 폭(41000)에 꼭 차고 넘치지 않는다
    const old = "ᄒᆞᆫ"
    assert.deepEqual(reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${old.repeat(42)}</hp:t></hp:run></hp:p>`)[0].map(s => s[0]), [0])
  })
  it("KoPub 실측 폭표 — 굵기끼리 같은 표", () => {
    const ga = "가".codePointAt(0)!
    for (const w of ["Light", "Medium", "Bold"]) {
      assert.equal(fontAdvanceEm1000(`KoPub바탕체 ${w}`, ga), 936)
      assert.equal(fontAdvanceEm1000(`KoPub돋움체 ${w}`, ga), 872)
    }
    assert.equal(fontAdvanceEm1000("KoPubWorld돋움체_Pro Light", ga), 872)
  })

  it("실측 폭표 없는 주요 글꼴은 한컴 저장본 맞춤 폭표", () => {
    const ga = "가".codePointAt(0)!
    for (const f of ["바탕", "한양신명조", "한컴바탕", "돋움"]) assert.ok(fontAdvanceEm1000(f, ga) !== null, f)
  })

  it("공백 최소값만큼 줄에 더 들어간다", () => {
    const text = "가가 가가 가가"
    const widths = [...text].map(c => (c === " " ? 50 : 100)) // 700
    assert.deepEqual(simulateWrap(text, 680, 680, 1000, 100, "keep", { widths }).starts, [0, 6])
    assert.deepEqual(simulateWrap(text, 680, 680, 1000, 100, "keep", { widths, condensePct: 50 }).starts, [0]) // 680 + 100·50% ≥ 700
    assert.deepEqual(simulateWrap(text, 680, 680, 1000, 100, "keep", { widths, condensePct: 10 }).starts, [0, 6]) // 680 + 10 < 700
    // 공백 최소값은 자간 전 공백 폭으로 잰다 — 공백 50(자간 −10 → 40) 둘: 662 + 100·20% = 682 ≥ 680(마지막 글자 자간 뺀 줄 폭), 자간 뒤로 재면 662 + 16 < 680
    const sp = [...text].map(c => (c === " " ? -10 : 0)), w2 = [...text].map(c => (c === " " ? 40 : 100))
    assert.deepEqual(simulateWrap(text, 662, 662, 1000, 100, "keep", { widths: w2, spacings: sp, condensePct: 20, kinsoku: "hancom" }).starts, [0])
  })

  it("한컴 금칙 — 닫는 작은따옴표는 줄머리에 오지 않는다", () => {
    const text = "가가가’"
    const widths = [100, 100, 100, 100]
    assert.deepEqual(simulateWrap(text, 300, 300, 1000, 100, "charAll", { widths }).starts, [0, 3])
    assert.deepEqual(simulateWrap(text, 300, 300, 1000, 100, "charAll", { widths, kinsoku: "hancom" }).starts, [0, 2])
  })
})

import { simulateWrap as wrap } from "../src/hwpx/text-metrics.js"
import { reflowSection, glyphWidth } from "../src/render/reflow.js"
import { parseRenderStyles, hwpxAppMajor, hwpxAppBuild } from "../src/render/head-styles.js"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const HEAD = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="LATIN"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces>
<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="1" height="1000"><hh:fontRef hangul="0" latin="0"/><hh:supscript/></hh:charPr></hh:charProperties>
<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
/** 구역 XML 을 reflow 해 문단마다 lineseg [textpos, horzsize, horzpos] 목록을 돌려준다 */
function reflowed(body: string, bodyW = 42000, head = HEAD): number[][][] {
  const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
  const root = doc.documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: bodyW, BODY_H: 80000 })
  return Array.from(root.getElementsByTagName("hp:p") as unknown as Element[]).map(p => {
    const lsa = Array.from(p.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")
    return lsa ? Array.from(lsa.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => [Number(s.getAttribute("textpos")), Number(s.getAttribute("horzsize")), Number(s.getAttribute("horzpos"))]) : []
  })
}
const tbl = (w: number) => `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="${w}" height="2000"/><hp:pos treatAsChar="1"/><hp:outMargin left="283" right="283" top="283" bottom="283"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSz width="${w}" height="2000"/></hp:tc></hp:tr></hp:tbl>`

describe("reflow 한컴 조판 규칙 — 개체·컨트롤·다단·하위 목록", () => {
  it("본문 폭 인라인 표 둘은 한 줄에 하나씩 — 표는 그 폭의 글자다", () => {
    const [p] = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl(41700)}${tbl(41700)}<hp:t/></hp:run></hp:p>`)
    assert.deepEqual(p.map(s => s[0]), [0, 8])
  })
  it("쪽 번호 컨트롤 뒤 넓은 표는 다음 줄 — 구역·단 정의가 아닌 컨트롤은 줄의 내용", () => {
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr/><hp:ctrl><hp:colPr colCount="1"/></hp:ctrl></hp:run><hp:run charPrIDRef="0"><hp:ctrl><hp:pageNum/></hp:ctrl>${tbl(41700)}<hp:t/></hp:run></hp:p>`
    assert.deepEqual(reflowed(body)[0].map(s => s[0]), [0, 24])
  })
  it("2단 구역은 단 폭으로 채운다", () => {
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr colCount="2" sameSz="1" sameGap="2000"/></hp:ctrl><hp:t>${"가".repeat(30)}</hp:t></hp:run></hp:p>`
    const [p] = reflowed(body)
    assert.equal(p[0][1], 20000) // (42000 − 2000) ÷ 2
    assert.deepEqual(p.map(s => s[0]), [0, 28]) // 컨트롤 8칸 + 20자(1000 씩)
  })
  it("미주 안 문단도 줄 정보를 만든다", () => {
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:endNote><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(50)}</hp:t></hp:run></hp:p></hp:subList></hp:endNote></hp:ctrl><hp:t>본문</hp:t></hp:run></hp:p>`
    const ps = reflowed(body)
    assert.deepEqual(ps[1].map(s => s[0]), [0, 42])
  })
  it("강제 줄바꿈(lineBreak) 뒤는 새 줄 — 줄바꿈은 앞 줄 끝 한 칸", () => {
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다<hp:lineBreak/>라마<hp:lineBreak/><hp:lineBreak/>바</hp:t></hp:run></hp:p>`
    assert.deepEqual(reflowed(body)[0].map(s => s[0]), [0, 4, 7, 8])
  })
  it("글머리표 문단은 글머리표 폭 + 간격(글자 크기의 textOffset%)만큼 좁게 채운다 — autoIndent 면 둘째 줄부터도", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:heading type="BULLET" idRef="1" level="0"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties>`)
      .replace("<hh:charProperties>", `<hh:bullets itemCnt="1"><hh:bullet id="1" char="가" useImage="0"><hh:paraHead level="0" autoIndent="1" textOffsetType="PERCENT" textOffset="50" charPrIDRef="4294967295"/></hh:bullet></hh:bullets><hh:charProperties>`)
    const para = (pp: number) => `<hp:p paraPrIDRef="${pp}"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(90)}</hp:t></hp:run></hp:p>`
    assert.deepEqual(reflowed(para(0), 42000, head)[0].map(s => s[0]), [0, 42, 84])
    assert.deepEqual(reflowed(para(1), 42000, head)[0].map(s => s[0]), [0, 40, 80]) // 42000 − (1000 + 500) → 40자
    assert.deepEqual([...new Set(reflowed(para(1), 42000, head)[0].map(s => s[1]))], [42000]) // lineseg 폭은 그대로
  })
  it("줄 중간에 앵커한 어울림 개체가 그 줄 위보다 아래서 시작하면 앵커 줄은 온 폭", () => {
    const pic = `<hp:pic textWrap="SQUARE"><hp:sz width="20000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" horzAlign="LEFT" vertOffset="1800" horzOffset="22000"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const segs = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(60)}</hp:t>${pic}<hp:t/></hp:run></hp:p>`)
    assert.deepEqual(segs[0].map(s => [s[0], s[1]]), [[0, 42000], [42, 42000]]) // 둘째 줄(1600~2600)은 그림 위 1800 과 겹쳐도 온 폭 — 종전엔 22000 으로 좁혀 셋째 줄이 생겼다
  })
  it("글 없이 수식만 든 줄은 수식 높이가 줄 높이(글자보다 낮아도) — 줄 간격은 글자 높이로", () => {
    const eq = `<hp:equation baseLine="1"><hp:sz width="5000" height="32"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:script>a</hp:script></hp:equation>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${eq}</hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>뒤</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const segs = Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(e => [Number(e.getAttribute("vertpos")), Number(e.getAttribute("vertsize"))])
    assert.deepEqual(segs, [[0, 32], [632, 1000]]) // 32 + 간격 600(1000 × 60%) — 종전엔 1000 줄로 1600
  })
  it("들여쓰기가 줄 폭 이상이면 들여쓰기를 두지 않는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:margin><hc:intent value="50000" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const segs = reflowed(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(10)}</hp:t></hp:run></hp:p>`, 42000, head)
    assert.deepEqual(segs[0].map(s => s[0]), [0]) // 종전엔 첫 줄 폭 500 이라 한 글자마다 줄이 바뀌었다
  })
  it("2024 이전 판은 들여쓰기와 글머리표 몫 중 큰 쪽만 첫 줄을 좁힌다(2024 는 더한다)", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:heading type="BULLET" idRef="1" level="0"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:margin><hc:intent value="1000" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
      .replace("<hh:charProperties>", `<hh:bullets itemCnt="1"><hh:bullet id="1" char="가" useImage="0"><hh:paraHead level="0" autoIndent="1" textOffsetType="PERCENT" textOffset="50" charPrIDRef="4294967295"/></hh:bullet></hh:bullets><hh:charProperties>`)
    const second = (appMajor: number) => {
      const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(90)}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head, { appMajor }), { BODY_W: 42000, BODY_H: 80000 })
      return Number((root.getElementsByTagName("hp:lineseg")[1] as unknown as Element).getAttribute("textpos"))
    }
    assert.equal(second(13), 39) // 42000 − 1000 − (1000 + 500)
    assert.equal(second(12), 40) // 42000 − max(1000, 1500)
  })
  it("테두리 있는 글자는 글자 상자가 테두리만큼 커서 줄을 높인다", () => {
    const head = HEAD.replace("</hh:charProperties>", `<hh:charPr id="7" height="1000" borderFillIDRef="9"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="8" height="1100"><hh:fontRef hangul="0" latin="0"/></hh:charPr></hh:charProperties>`)
      .replace("<hh:charProperties>", `<hh:borderFills itemCnt="1"><hh:borderFill id="9"><hh:topBorder type="SOLID" width="0.15 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.15 mm" color="#000000"/></hh:borderFill></hh:borderFills><hh:charProperties>`)
    const seg = (runs: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0">${runs}</hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      const e = root.getElementsByTagName("hp:lineseg")[0] as unknown as Element
      return ["vertsize", "textheight"].map(a => Number(e.getAttribute(a)))
    }
    assert.deepEqual(seg(`<hp:run charPrIDRef="0"><hp:t>가나 </hp:t></hp:run><hp:run charPrIDRef="7"><hp:t>예</hp:t></hp:run>`), [1042, 1084]) // 0.15mm = 42
    assert.deepEqual(seg(`<hp:run charPrIDRef="8"><hp:t>가나 </hp:t></hp:run><hp:run charPrIDRef="7"><hp:t>예</hp:t></hp:run>`), [1100, 1100]) // 1100 글자 줄의 1000 테두리 글자(1084)는 그대로
  })
  it("한글 2024 저장본의 글머리표·번호 문단은 공백 압축 없이 채운다 — 초기 빌드(3622 미만)는 압축한다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1" condense="50"><hh:align horizontal="LEFT"/><hh:heading type="BULLET" idRef="1" level="0"/><hh:breakSetting breakNonLatinWord="BREAK_WORD"/></hh:paraPr></hh:paraProperties>`)
      .replace("<hh:charProperties>", `<hh:bullets itemCnt="1"><hh:bullet id="1" char="가" useImage="0"><hh:paraHead level="0" autoIndent="1" textOffsetType="PERCENT" textOffset="0" charPrIDRef="4294967295"/></hh:bullet></hh:bullets><hh:charProperties>`)
    // 글머리표 1000 뒤 "가가가" 낱말 10개(공백 9개) = 34500 — 폭 35000 에 1000 + 34500 은 넘치고, 공백 4500 의 50% 를 줄이면 든다
    const starts = (appMajor: number, appBuild?: number) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${Array(10).fill("가가가").join(" ")}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head, { appMajor, appBuild }), { BODY_W: 35000, BODY_H: 80000 })
      return Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(e => Number(e.getAttribute("textpos")))
    }
    assert.deepEqual(starts(12), [0]) // 2024 이전 판: 압축으로 한 줄
    assert.deepEqual(starts(13), [0, 36]) // 2024: 압축 없이 마지막 낱말이 다음 줄
    assert.deepEqual(starts(13, 3622), [0, 36])
    assert.deepEqual(starts(13, 3050), [0]) // 2024 초기 빌드: 압축으로 한 줄
  })
  it("글머리표 머리 글자 모양이 더 크면 첫 줄 높이가 그 크기다", () => {
    const head = (cp: string) => HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:heading type="BULLET" idRef="1" level="0"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties>`)
      .replace("<hh:charProperties>", `<hh:bullets itemCnt="1"><hh:bullet id="1" char="가" useImage="0"><hh:paraHead level="0" autoIndent="1" textOffsetType="PERCENT" textOffset="50" charPrIDRef="${cp}"/></hh:bullet></hh:bullets><hh:charProperties>`)
      .replace("</hh:charProperties>", `<hh:charPr id="9" height="1200"><hh:fontRef hangul="0" latin="0"/></hh:charPr></hh:charProperties>`)
    const segs = (cp: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(60)}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head(cp)), { BODY_W: 42000, BODY_H: 80000 })
      return Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(e => Number(e.getAttribute("vertsize")))
    }
    assert.deepEqual(segs("4294967295"), [1000, 1000])
    assert.deepEqual(segs("9"), [1200, 1000]) // 머리 글은 첫 줄에만 있다
  })
  it("미주는 구역 끝의 단 폭, 머리 번호(autoNum \"1)\")는 그 글 폭을 차지한다", () => {
    const note = (num: boolean) => `<hp:endNote><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${num ? `<hp:ctrl><hp:autoNum num="1" numType="ENDNOTE"><hp:autoNumFormat type="DIGIT" suffixChar=")"/></hp:autoNum></hp:ctrl>` : ""}<hp:t>${"가".repeat(20)}</hp:t></hp:run></hp:p></hp:subList></hp:endNote>`
    const body = (num: boolean) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr colCount="1"/></hp:ctrl><hp:ctrl>${note(num)}</hp:ctrl><hp:t>본문</hp:t></hp:run></hp:p>` +
      `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr colCount="2" sameSz="1" sameGap="2000"/></hp:ctrl><hp:t>둘째 단</hp:t></hp:run></hp:p>`
    const plain = reflowed(body(false))[1], numbered = reflowed(body(true))[1]
    assert.deepEqual(plain.map(s => s[1]), [20000]) // (42000 − 2000) ÷ 2 — 미주가 걸린 1단 폭(42000)이 아니다
    assert.deepEqual(plain.map(s => s[0]), [0]) // 20자 × 1000 = 20000 에 꼭 찬다
    assert.equal(numbered.length, 2) // "1)" 몫만큼 넘친다
  })
  it("글꼴에 없는 가운뎃점(‧ ․)은 한컴바탕 대체 폭으로 잰다", () => {
    for (const fc of ["cjk", "fixedPitch", "font:한컴 윤고딕 240"] as const) assert.equal(hancomCharWidth("‧", 1000, 100, 0, fc), 172, fc) // 4·MulDiv(173, 250, 1000)
    assert.equal(hancomCharWidth("‧", 1000, 100, 0, "font:휴먼명조"), 420) // 그 글자를 가진 글꼴은 제 폭
  })
  it("굵은 글꼴이 없는 옛 HFT 글꼴의 진하게는 글자마다 폭을 넓힌다", () => {
    assert.equal(hancomCharWidth("가", 1000, 100, 0, "font:한양신명조", syntheticBoldEm("한양신명조", true)), 1052) // 4·MulDiv(1050, 250, 1000)
    assert.deepEqual([syntheticBoldEm("한양해서"), syntheticBoldEm("한양해서", true)], [0, 50]) // TTF 한양 계열은 넓히지 않는다
    assert.equal(syntheticBoldEm("휴먼명조"), 0) // 굵은 글꼴이 있는 글꼴은 그대로
    assert.equal(syntheticBoldEm("휴먼명조", true), 50) // HFT 휴먼명조는 굵은 글꼴이 없다
    assert.deepEqual([syntheticBoldEm("휴먼고딕"), syntheticBoldEm("휴먼고딕", true)], [0, 50]) // 휴먼고딕도 TTF 는 굵은 글꼴이 있다
    assert.equal(syntheticBoldEm("#세나루", true), 50) // HWP 3 문서의 HFT 영문 글꼴
    assert.equal(syntheticBoldEm("HCI Poppy", true), 0) // 굵은 글꼴이 있는 HFT 는 그대로
    // 진하게 HFT HCI Tulip 영문은 굵은 글꼴 폭(a 0.499·r 0.443em, 보통체 0.443·0.332) — 획 넓히기 50 을 더하지 않는다
    assert.deepEqual(["a", "r", "c"].map(c => fontAdvanceEm1000("HCI Tulip Bold", c.codePointAt(0)!)), [499, 443, 443])
    const tulip = (bold: boolean) => ({ ...parseRenderStyles(HEAD).charPr.get("0")!, face: "HCI Tulip", hft: true, bold, height: 1000, ratio: 100, spacing: 0, latin: undefined })
    assert.deepEqual([glyphWidth("a", tulip(true)).w, glyphWidth("a", tulip(false)).w], [500, 444]) // 4·MulDiv(499, 250, 1000) · 4·MulDiv(443, 250, 1000)
    const holly = { ...tulip(true), face: "HCI Hollyhock" }
    assert.equal(glyphWidth("b", holly).w, 612) // 진하게 HCI Hollyhock b 0.610em(보통 0.555) — 4·MulDiv(610, 250, 1000)
    const poppy = (bold: boolean) => ({ ...tulip(bold), face: "HCI Poppy" })
    assert.deepEqual(["b", "·", "é"].map(c => glyphWidth(c, poppy(true)).w), [608, 432, 540]) // 진하게 HCI Poppy 도 굵은 글꼴 폭(ASCII 밖 영문 포함)
    assert.deepEqual(["·", "é", "°"].map(c => glyphWidth(c, poppy(false)).w), [384, 492, 408]) // ASCII 밖 영문도 제 폭(1em 이 아니다)
    const hftHead = HEAD.replace('<hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="LATIN">', '<hh:font id="0" face="바탕"/><hh:font id="1" face="휴먼명조" type="HFT"/><hh:font id="2" face="휴먼명조" type="TTF"/></hh:fontface><hh:fontface lang="LATIN">')
      .replace("</hh:charProperties>", `<hh:charPr id="5" height="1000"><hh:fontRef hangul="1" latin="0"/><hh:bold/></hh:charPr><hh:charPr id="6" height="1000"><hh:fontRef hangul="2" latin="0"/><hh:bold/></hh:charPr></hh:charProperties>`)
    const boldLines = (cpr: number) => reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="${cpr}"><hp:t>${"가".repeat(41)}</hp:t></hp:run></hp:p>`, 42000, hftHead)[0].length
    assert.equal(boldLines(5), 2) // HFT 항목 휴먼명조 진하게: 41 × 1048 > 42000
    assert.equal(boldLines(6), 1) // TTF 항목은 그대로 41 × 1000
    assert.equal(syntheticBoldEm("바탕"), 0)
    const head = HEAD.replace('<hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="LATIN">', '<hh:font id="0" face="바탕"/><hh:font id="1" face="한양신명조" type="HFT"/></hh:fontface><hh:fontface lang="LATIN">')
      .replace("</hh:charProperties>", `<hh:charPr id="2" height="1000"><hh:fontRef hangul="1" latin="0"/><hh:bold/></hh:charPr><hh:charPr id="3" height="1000"><hh:fontRef hangul="1" latin="0"/></hh:charPr></hh:charProperties>`)
    const lines = (cpr: number) => reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="${cpr}"><hp:t>${"가".repeat(41)}</hp:t></hp:run></hp:p>`, 42000, head)[0].length
    assert.equal(lines(3), 1) // 41 × 1000
    assert.equal(lines(2), 2) // 41 × 1048 > 42000
  })
  it("한글 2024 는 왼쪽 어울림 개체가 깎은 줄을 문단 왼쪽 여백만큼 더 좁힌다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:left value="1000" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const pic = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="3000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0" horzRelTo="COLUMN" horzAlign="LEFT" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const segs = reflowed(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0">${pic}<hp:t>${"가".repeat(45)}</hp:t></hp:run></hp:p>`, 42000, head)[0]
    assert.deepEqual(segs.map(x => x[0]), [0, 46]) // 개체 끝 3000 ~ 42000(폭 39000)에서 왼쪽 여백 1000 을 더 빼 46자(종전 47자)
    assert.deepEqual(segs[0].slice(1), [39000, 3000]) // 저장 horzsize·horzpos 는 개체 끝 기준 그대로
  })
  it("글 있는 문단 아래 띠로 놓인 표는 띠 위에서 끝나는 뒤 문단을 밀지 않는다", () => {
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="3000"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="5000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const para = (body: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${para(`${tbl}<hp:t>호스트</hp:t>`)}${para("<hp:t/>")}${para("<hp:t>뒤</hp:t>")}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const vps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => { const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!; return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")) })
    // 띠 3000~8000: 빈 문단(1600~2600)은 제자리, 띠에 닿는 다음 문단은 띠 아래 8000(종전엔 빈 문단부터 8000)
    assert.deepEqual(vps, [0, 1600, 8000])
  })
  it("쪽 바닥을 넘는 어울림 그림은 이 쪽 줄을 좁히지 않고 다음 쪽 맨 위부터 좁힌다", () => {
    const pic = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0" horzRelTo="COLUMN" horzAlign="LEFT" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const para = (body: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p>`
    const body = Array.from({ length: 4 }, (_, i) => para(`<hp:t>앞${i}</hp:t>`)).join("") + para(`${pic}<hp:t>호스트</hp:t>`) + para("<hp:t>뒤0</hp:t>") + para("<hp:t>뒤1</hp:t>")
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const segs = Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => [Number(s.getAttribute("vertpos")), Number(s.getAttribute("horzpos"))])
    // 호스트 6400 + 그림 5000 > 10000 — 호스트·뒤0 은 온 폭(horzpos 0), 다음 쪽 뒤1 은 그림 옆(10000)
    assert.deepEqual(segs.slice(4), [[6400, 0], [8000, 0], [0, 10000]])
  })
  it("글 있는 문단의 어울림 개체가 줄 자리를 다 덮으면 글은 개체 아래에서 시작한다", () => {
    const pic = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="41800" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0" horzRelTo="COLUMN" horzAlign="LEFT" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const segs = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>${"가".repeat(10)}</hp:t></hp:run></hp:p>`)[0]
    assert.deepEqual(segs.map(x => x[0]), [0]) // 틈 200 에 한 글자씩 넣지 않고 그림 아래 한 줄(종전엔 10줄)
  })
  it("어울림 개체는 앵커 글자가 놓인 줄보다 위로 가지 않는다", () => {
    const pic = `<hp:pic textWrap="SQUARE" textFlow="LARGEST_ONLY"><hp:sz width="20000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0" horzRelTo="COLUMN" horzAlign="RIGHT" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const segs = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(90)}</hp:t>${pic}<hp:t>${"가".repeat(60)}</hp:t></hp:run></hp:p>`)[0]
    // 앵커(91번째 슬롯)는 셋째 줄 — 첫 두 줄은 온 폭(42000 = 42자), 셋째 줄부터 그림 옆 22000(22자). 종전엔 첫 줄부터 좁았다
    assert.deepEqual(segs.slice(0, 3).map(x => x[1]), [42000, 42000, 22000])
  })
  it("한 문단의 떠 있는 위아래 배치 표는 차례로 쌓이고, 둘 이상이면 빈 줄도 그 아래로 간다", () => {
    const tbl = (h: number, vo = 0) => `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="10000" height="${h}"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="${vo}"/><hp:outMargin left="0" right="0" top="100" bottom="100"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const firstV = (objs: string, text: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${objs}<hp:t>${text}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      const segs = Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[])
      return Number(segs[segs.length - 1].getAttribute("vertpos"))
    }
    assert.equal(firstV(tbl(1000) + tbl(2000), "가"), 3400) // (100 + 1000 + 100) + (100 + 2000 + 100) — 종전엔 큰 쪽 하나(2200)
    assert.equal(firstV(tbl(1000) + tbl(2000, 4294960072), "가"), 3400) // vertOffset −7224(부호 없는 32비트 저장)는 앞 표 바닥에서 멈춘다
    assert.equal(firstV(tbl(1000) + tbl(2000), ""), 3400) // 둘 이상이면 빈 줄도 그 아래
    assert.equal(firstV(tbl(1000), ""), 0) // 하나면 빈 줄은 제자리
    assert.equal(firstV(tbl(1000), "   "), 1200) // 공백뿐인 글은 글처럼 — 오프셋 0 이면 줄이 표 아래(한컴 저장본: 오프셋 0 공백 호스트 5개 모두)
  })
  it("위아래 배치 개체는 문단 위 간격 앞에 놓이고, 글은 위 간격과 개체 바닥 중 아래에서 시작한다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="3"><hh:align horizontal="LEFT"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:prev value="1000" unit="HWPUNIT"/></hh:margin></hp:case></hp:switch></hh:paraPr></hh:paraProperties>`)
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="100" bottom="100"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="5000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const vps = (body: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      return Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => Number((p.getElementsByTagName("hp:lineseg")[p.getElementsByTagName("hp:lineseg").length - 1] as unknown as Element).getAttribute("vertpos")))
    }
    const lead = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t></hp:run></hp:p>`
    // 앞 문단 바닥 1600 + 위 간격 1000 = 2600, 표는 1600 에 놓여 바닥 6800 → 글은 6800(종전엔 2600 + 5200 = 7800)
    assert.deepEqual(vps(lead + `<hp:p paraPrIDRef="3"><hp:run charPrIDRef="0">${tbl}<hp:t>글</hp:t></hp:run></hp:p>`), [0, 6800])
    // 글 없는 문단의 표 바닥 6800 이 다음 문단(위 간격 1000)의 첫 줄 — 빈 줄 바닥 4200 + 1000 보다 아래, 표 바닥에 위 간격을 더하지 않는다(종전 7800 + 1000)
    assert.deepEqual(vps(lead + `<hp:p paraPrIDRef="3"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="3"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p>`).slice(2), [6800])
  })
  it("글꼴에 어울리는 줄 높이는 글꼴의 위·아래 높이로 줄 높이·기준선을 정한다", () => {
    const head = HEAD.replace('<hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="LATIN">', '<hh:font id="0" face="바탕"/><hh:font id="1" face="맑은 고딕"/></hh:fontface><hh:fontface lang="LATIN">')
      .replace('<hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces>', '<hh:font id="0" face="바탕"/><hh:font id="1" face="맑은 고딕"/></hh:fontface></hh:fontfaces>')
      .replace("</hh:charProperties>", `<hh:charPr id="2" height="1200"><hh:fontRef hangul="1" latin="1"/></hh:charPr><hh:charPr id="3" height="2000"><hh:fontRef hangul="1" latin="1"/></hh:charPr><hh:charPr id="4" height="2100"><hh:fontRef hangul="1" latin="1"/></hh:charPr></hh:charProperties>`)
      .replace("</hh:paraProperties>", `<hh:paraPr id="1" fontLineHeight="1"><hh:align horizontal="LEFT"/><hh:lineSpacing type="PERCENT" value="100"/></hh:paraPr></hh:paraProperties>`)
    const seg = (cpr: number, text: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="1"><hp:run charPrIDRef="${cpr}"><hp:t>${text}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      return ["vertsize", "baseline"].map(a => Number((root.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute(a)))
    }
    assert.deepEqual(seg(2, "가나"), [1598, 1307]) // 맑은 고딕 1200: round(1200 × 2230 / 2048) + round(1200 × 496 / 2048), 기준선 앞쪽
    assert.deepEqual([seg(3, "가나"), seg(4, "가나")], [[2662, 2178], [2796, 2287]]) // 2000 → 2178 + 484, 2100 → 2287 + 509
    assert.deepEqual(seg(0, "가나"), [1000, 858]) // 바탕 1000: 높이 그대로, 기준선 1758/2048
    assert.deepEqual(seg(0, ""), [1000, 850]) // 글 없는 줄은 종전대로
  })
  it("서울남산체 한글은 글자마다 제 폭으로 잰다(08 접두 이름도)", () => {
    const st = (face: string) => ({ face, height: 1000, ratio: 100, spacing: 0, rel: 100 }) as any
    assert.deepEqual(["가", "A", "○"].map(ch => glyphWidth(ch, st("08서울남산체 B")).w), [908, 652, 940]) // 종전엔 1000·708·1000
    assert.equal(glyphWidth("가", st("서울남산체 L")).w, 908)
  })
  it("쪽보다 높은 줄도 쪽 중간에서 시작하면 새 쪽 맨 위로", () => {
    const big = tbl(10000).replace(/height="2000"/g, 'height="12000"')
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${big}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const own = Array.from(ps[1].childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    assert.equal(Number((own.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")), 0) // 종전엔 1600 에 남았다
  })
  it("줄 바닥이 쪽 바닥과 딱 같으면 다음 쪽으로 넘긴다", () => {
    const at = (bodyH: number) => {
      const paras = Array.from({ length: 4 }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>줄${i}</hp:t></hp:run></hp:p>`).join("")
      const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${paras}</hs:sec>`, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: bodyH })
      const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
      return Number((ps[3].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(at(5801), 4800) // 4800 + 1000 < 5801
    assert.equal(at(5800), 0) // 4800 + 1000 = 5800 — 넘친 것(종전엔 그 쪽에 남았다)
  })
  it("쪽 아래 각주 영역은 본문 바닥을 올린다", () => {
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>주</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    const sixth = (withNote: boolean) => {
      const paras = Array.from({ length: 7 }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>줄${i}</hp:t>${i === 0 && withNote ? fn : ""}</hp:run></hp:p>`).join("")
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${paras}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
      const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
      return Number((ps[5].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(sixth(false), 8000) // 8000 + 1000 ≤ 10000
    assert.equal(sixth(true), 0) // 각주 영역 850 + 567 + 1000 → 바닥 7583, 9000 에 닿는 여섯째 줄은 다음 쪽
  })
  it("고정 줄 간격 문단은 글자처럼 취급한 표 줄도 그 간격만 나아간다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:lineSpacing type="FIXED" value="1800"/></hh:paraPr></hh:paraProperties>`)
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="1"><hp:run charPrIDRef="0">${tbl(10000).replace('height="2000"', 'height="20000"').replace('height="2000"', 'height="20000"')}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
    const segs = Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[])
    const seg = segs[segs.length - 1] // 본문 문단 줄(앞은 칸 안 문단)
    const [vs, sp] = ["vertsize", "spacing"].map(a => Number(seg.getAttribute(a)))
    assert.deepEqual([vs, vs + sp], [20566, 1800]) // 표 줄(20000 + 바깥 여백 566)도 고정 간격 1800 만 나아간다
  })
  it("글자처럼 취급하는 글상자는 안 글 높이만큼 줄을 높인다", () => {
    const box = (lines: number) => `<hp:rect textWrap="IN_FRONT_OF_TEXT"><hp:drawText lastWidth="20000"><hp:textMargin left="283" right="283" top="425" bottom="425"/><hp:subList>${Array.from({ length: lines }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>조건${i}</hp:t></hp:run></hp:p>`).join("")}</hp:subList></hp:drawText><hp:sz width="20000" height="1249"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:rect>`
    const nextV = (lines: number) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${box(lines)}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
      return Number((ps[1].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    // 한 줄이면 안 글 1000 + 850 = 1850 > sz 1249, 세 줄이면 안 글 바닥 1000 + 2×1600 = 4200 + 850
    assert.equal(nextV(3) - nextV(1), 3200)
  })
  it("쪽에 걸친 문단은 그 줄까지 참조된 각주만 이 쪽 각주 영역에 넣는다", () => {
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"주".repeat(150)}</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    // 쪽 높이 10000: 앞 문단 넷(0~4800) 뒤 다섯 줄 문단 — 각주 참조는 그 문단 마지막 줄에 있다
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${Array.from({ length: 4 }, () => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t></hp:run></hp:p>`).join("")}<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(42 * 4 + 5)}</hp:t>${fn}</hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const own = Array.from(ps[4].childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    const vps = Array.from(own.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(e => Number(e.getAttribute("vertpos")))
    // 각주(4줄 = 6400 + 850 + 567)는 마지막 줄과 함께 다음 쪽 — 이 쪽에는 각주 없이 6400·8000 두 줄이 든다(종전엔 첫 줄부터 넘겼다)
    assert.deepEqual(vps.slice(0, 2), [6400, 8000])
  })
  it("묶음 개체의 캡션도 개체 높이에 든다", () => {
    const cap = `<hp:caption side="BOTTOM" fullSz="0" width="8504" gap="850" lastWidth="10000"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>그림 1</hp:t></hp:run></hp:p></hp:subList></hp:caption>`
    const cont = `<hp:container textWrap="TOP_AND_BOTTOM"><hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="5000"/></hp:pic><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="1" vertRelTo="PARA"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${cap}</hp:container>`
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${cont}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const p0 = Array.from(root.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:p")!
    const own = Array.from(p0.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    assert.equal(Number((own.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertsize")), 6850) // 5000 + 간격 850 + 캡션 줄 1000(종전엔 5000)
  })
  it("쪽 끝 줄이 제 각주와 함께 안 들면 줄은 이 쪽에 남고 각주는 다음 쪽으로 간다", () => {
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"주".repeat(60)}</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    // 쪽 높이 10000: 앞 문단 셋(0~3200) 뒤 세 줄 문단 4800·6400·…, 각주(2줄 2600 + 850 + 567)는 둘째 줄에 참조
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${Array.from({ length: 3 }, () => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t></hp:run></hp:p>`).join("")}<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(50)}</hp:t>${fn}<hp:t>${"가".repeat(40)}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const own = Array.from(ps[3].childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    const vps = Array.from(own.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(e => Number(e.getAttribute("vertpos")))
    // 둘째 줄(6400~7400)은 각주와 함께면 바닥 5983 을 넘지만 줄만은 든다 — 이 쪽 끝 줄, 각주와 셋째 줄은 다음 쪽(종전엔 둘째 줄부터 넘겼다)
    assert.deepEqual(vps, [4800, 6400, 0])
  })
  it("쪽 끝 문단의 마지막 줄 각주가 그 쪽에 안 들어 넘어가면 다음 쪽 각주 영역에 든다", () => {
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"주".repeat(60)}</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    const p = (txt: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${txt}</hp:t></hp:run></hp:p>`
    // 쪽 10000: 앞 문단 넷(0~4800) 뒤 두 줄 문단 6400·8000 — 각주(2줄 2600 + 850 + 567)는 둘째 줄. 줄은 남고 각주는 다음 쪽
    const xml = `<hs:sec ${NS}>${Array.from({ length: 4 }, () => p("앞")).join("")}<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(50)}</hp:t>${fn}<hp:t>가</hp:t></hp:run></hp:p>${Array.from({ length: 5 }, () => p("뒤")).join("")}</hs:sec>`
    const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const v = (q: Element) => Number((Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    // 다음 쪽 바닥 = 10000 − 4017 = 5983 — 뒤 문단 다섯째(6400)는 그다음 쪽(종전엔 넘어간 각주를 세지 않아 6400 에 남았다)
    assert.deepEqual(ps.slice(5).map(v), [0, 1600, 3200, 4800, 0])
  })
  it("문단 안 표 칸에 붙은 각주도 그 쪽 각주 영역에 든다", () => {
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>주</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    const cellTbl = (note: string) => `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="10000" height="1000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t>${note}</hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSz width="10000" height="1000"/></hp:tc></hp:tr></hp:tbl>`
    const sixth = (where: "none" | "cell" | "para") => {
      const first = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${cellTbl(where === "cell" ? fn : "")}${where === "para" ? fn : ""}</hp:run></hp:p>`
      const paras = first + Array.from({ length: 6 }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>줄${i + 1}</hp:t></hp:run></hp:p>`).join("")
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${paras}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
      const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
      return Number((ps[5].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.notEqual(sixth("para"), sixth("none")) // 문단 각주는 여섯째 줄을 다음 쪽으로
    assert.equal(sixth("cell"), sixth("para")) // 칸 안 각주도 쪽 바닥을 올린다
  })
  it("단 밖으로 나간 위아래 배치 개체는 글을 밀지 않는다", () => {
    const pic = (ho: number) => `<hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="20000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0" horzRelTo="COLUMN" horzAlign="CENTER" horzOffset="${ho}"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const nextV = (ho: number) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic(ho)}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      return Number((root.getElementsByTagName("hp:lineseg")[1] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(nextV(0), 20000) // 단 안 그림은 다음 문단을 민다
    assert.equal(nextV(30000), 1600) // 왼쪽 끝 16000 + 30000 > 단 폭 42000 — 빈 줄 다음에 바로
  })
  it("단 나누기(columnBreak) 문단은 새 단 맨 위에서 시작한다", () => {
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>첫 단</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0" columnBreak="1"><hp:run charPrIDRef="0"><hp:t>둘째 단</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    assert.deepEqual(Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos"))), [0, 0]) // 종전엔 1600
  })
  it("칸 줄은 다 들고 그 칸의 그림만 쪽을 넘으면 표는 갈라지고 그림이 다음 쪽 조각이 된다", () => {
    const pic = `<hp:pic textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES"><hp:sz width="5000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0" horzRelTo="COLUMN" horzAlign="LEFT" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const tc = (r: number, h: number, body: string) => `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="2" colCnt="1"><hp:sz width="10000" height="9000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${tc(0, 8000, `${pic}<hp:t/>`)}${tc(1, 1000, "<hp:t>캡션</hp:t>")}</hp:tbl>`
    const para = (body: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p>`
    const body = Array.from({ length: 4 }, (_, i) => para(`<hp:t>앞${i}</hp:t>`)).join("") + para(`${tbl}<hp:t/>`) + para("<hp:t>뒤</hp:t>")
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const v = (q: Element) => { const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!; return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")) }
    // 표 6400~: 첫 행의 빈 줄은 이 쪽, 그림 5000 은 다음 쪽 맨 위 — 뒤 문단 = 그림 5000 + 캡션 행 1000(종전엔 표째 넘겨 8000 + 1000)
    assert.deepEqual([v(ps[4]), v(ps[5])], [6400, 6000])
  })
  it("쪽 바닥을 넘는 떠 있는 표(행 단위 나눔)는 넘치는 행부터 다음 쪽으로 — 다음 문단은 남은 행 아래", () => {
    const row = (i: number) => `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${i}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const tbl = (pb: string, wrap = "TOP_AND_BOTTOM") => `<hp:tbl textWrap="${wrap}" pageBreak="${pb}" rowCnt="10" colCnt="1"><hp:sz width="${wrap === "SQUARE" ? 42000 : 10000}" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="141"/>${Array.from({ length: 10 }, (_, i) => row(i)).join("")}</hp:tbl>`
    const nextV = (pb: string, wrap?: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl(pb, wrap)}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 7000 })
      const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
      return Number((ps[1].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(nextV("TABLE"), 4141) // 1쪽 6행(6000 + 141 ≤ 7000, 7행이면 넘침), 2쪽 4행 4000 + outMargin 아래 141
    assert.equal(nextV("NONE"), 0) // 나누지 않는 표는 종전대로 — 다음 문단이 새 쪽 맨 위
    assert.equal(nextV("TABLE", "SQUARE"), 4141) // 본문 폭 어울림 표도 같은 행 나눔
    // 글 있는 문단의 띠 표(오프셋 > 0)도 — 글은 제자리, 다음 문단은 다음 쪽 남은 행 아래
    const band = tbl("TABLE").replace('vertOffset="0"', 'vertOffset="2000"')
    const bdoc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>글</hp:t>${band}</hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const broot = bdoc.documentElement as unknown as Element
    reflowSection(broot, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 8000 })
    const bps = Array.from(broot.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const first = (q: Element) => Number((Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    assert.deepEqual([first(bps[0]), first(bps[1])], [0, 5141]) // 쪽 8000: 1쪽 2000~7000 에 5행, 2쪽 5행 5000 + 141(종전엔 표를 가르지 않아 다음 문단이 새 쪽 0)
    // 글 있는 앵커 문단도 — 앵커 글 줄은 마지막 쪽의 표 아래(종전엔 표만 다음 쪽으로 넘기고 글은 1쪽 맨 위)
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl("TABLE", "SQUARE")}<hp:t>글</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 7000 })
    const p0 = Array.from(root.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:p")!
    const own = Array.from(p0.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    assert.equal(Number((own.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")), 4141)
  })
  it("새 빌드 저장본(2022 4605·2024 3901 이상)은 휴먼명조 큰따옴표를 반각으로 잰다", () => {
    assert.equal(hwpxAppBuild(`<hv:HCFVersion appVersion="13, 0, 0, 3901 WIN32LEWindows_10"/>`), 3901)
    const half = (major: number, build: number) => [...parseRenderStyles(HEAD, { appMajor: major, appBuild: build }).charPr.values()].every(s => s.halfQuote)
    assert.deepEqual([half(13, 3901), half(12, 4605), half(13, 3050), half(12, 4426)], [true, true, false, false])
    const st = { face: "휴먼명조", height: 1000, ratio: 100, spacing: 0, rel: 100 } as any
    assert.deepEqual(["“", "”"].map(ch => glyphWidth(ch, { ...st, halfQuote: true }).w), [500, 500])
    assert.deepEqual(["‘", "’"].map(ch => glyphWidth(ch, { ...st, halfQuote: true }).w), [312, 312]) // 2024 새 빌드 작은따옴표도 같은 폭(종전 216·588)
    assert.deepEqual(["“", "”"].map(ch => glyphWidth(ch, st).w), [1000, 1000])
    // ‧ 는 반각 따옴표 전 빌드(2024 3901 미만)만 옛 폭 0.173em — 새 빌드는 2024 폭
    assert.equal(glyphWidth("‧", st).w, 172) // 1000 × 0.173 → 172(4 단위 내림)
    assert.notEqual(glyphWidth("‧", { ...st, halfQuote: true }).w, 172)
  })
  it("행마다 칸 폭 합이 다르면 짧은 행의 끝 칸은 열 경계(가장 먼 끝)까지 넓어진다", () => {
    const tc = (c: number, r: number, span: number, w: number, text: string) => `<hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="${span}" rowSpan="1"/><hp:cellSz width="${w}" height="1000"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`
    const tbl = `<hp:tbl rowCnt="2" colCnt="2"><hp:sz width="8000" height="2000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${tc(0, 0, 2, 8000, "가")}</hp:tr><hp:tr>${tc(0, 1, 1, 1000, "나")}${tc(1, 1, 1, 6000, "다")}</hp:tr></hp:tbl>`
    const segs = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p>`)
    assert.deepEqual(segs.slice(1, 4).map(x => x[0][1]), [7716, 1440, 6716]) // 끝 칸 6000 → 8000 − 1000 = 7000(여백 뺀 폭, 종전 5716)
  })
  it("칸 안 위아래 배치 표는 그 문단 글은 두고 다음 문단을 표 바닥 아래로 민다", () => {
    const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="200"/><hp:outMargin left="0" right="0" top="100" bottom="100"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t>호스트</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p>`
    const outer = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="20000" height="6000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="6000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${outer}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => {
      const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
      return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    })
    assert.deepEqual(vps, [0, 3400]) // 호스트 줄은 제자리, 다음 문단 = 200 + 100 + 3000 + 100(종전엔 줄 끝 1600)
  })
  it("오프셋 둔 표가 첫 행부터 안 들어 통째로 다음 쪽으로 가면 이 쪽은 표 자리부터 띠, 다음 쪽 글은 표 아래", () => {
    const row = `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="5000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const t = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="TABLE" rowCnt="1" colCnt="1"><hp:sz width="5000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="3000"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${row}</hp:tbl>`
    const para = (inner: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}</hp:run></hp:p>`
    // 쪽 높이 6000: 빈 앵커 0, 표 자리 3000~(첫 행 5000 이 안 든다) → 표는 다음 쪽 0~5000. 뒤 문단 1600~2600 은 띠(3000) 위에 들어 제자리, 그다음(3200)은 띠에 걸려 다음 쪽 표 아래 5000
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${para(`${t}<hp:t/>`)}${para("<hp:t>가</hp:t>")}${para("<hp:t>나</hp:t>")}</hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 6000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const v = (q: Element) => { const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!; return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")) }
    assert.deepEqual([v(ps[1]), v(ps[2])], [1600, 5000]) // 종전엔 둘 다 다음 쪽 표 아래
  })
  it("앞 문단의 띠에 밀린 문단은 앵커 표도 띠 아래로 함께 옮긴다", () => {
    const t = (vo: number, h: number) => `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="${h}"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="${vo}"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    // 글 있는 문단의 오프셋 2000 표 → 띠 [2000, 5000], 다음 빈 문단의 줄(1600 자리)은 띠 아래 5000 — 그 문단의 오프셋 1000 표도 5000 + 1000 에서
    const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${t(2000, 3000)}<hp:t>글</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${t(1000, 2000)}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>뒤</hp:t></hp:run></hp:p></hs:sec>`
    const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const v = (q: Element) => { const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!; return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")) }
    assert.deepEqual([v(ps[1]), v(ps[2])], [5000, 8000]) // 종전엔 표를 1600 + 1000 에 두어 뒤 문단 6600
  })
  it("겹침 허용 위아래 배치 그림만 든 빈 문단은 줄이 그림 아래로 간다", () => {
    const pic = (ov: string) => `<hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" allowOverlap="${ov}" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const own = (ov: string) => {
      const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic(ov)}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      return Number((root.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.deepEqual([own("1"), own("0")], [3000, 0])
  })
  it("본문의 공백뿐인 호스트 줄은 개체 세로 오프셋 안에 들면 제자리, 아니면 위아래 배치 표 아래로 간다", () => {
    const ownV = (vo: number) => {
      const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="${vo}"/><hp:outMargin left="0" right="0" top="100" bottom="100"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t>    </hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      const p0 = Array.from(root.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:p")!
      const own = Array.from(p0.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
      return Number((own.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(ownV(300), 3500) // 줄 1000 이 오프셋 300 에 안 든다 — 300 + 100 + 3000 + 100(종전엔 0)
    assert.equal(ownV(2000), 0) // 오프셋 2000 위에 줄이 든다
  })
  it("칸 안 다단은 단 폭으로 채우고 단 나누기 문단은 다음 단 맨 위에서 시작한다", () => {
    const col = `<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="2" sameSz="1" sameGap="2000"/></hp:ctrl>`
    const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${col}<hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>나</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0" columnBreak="1"><hp:run charPrIDRef="0"><hp:t>다</hp:t></hp:run></hp:p>`
    const tbl = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="22000" height="3000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="22000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const first = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => q.getElementsByTagName("hp:lineseg")[0] as unknown as Element)
    // 단 폭 (22000 − 2000) ÷ 2 = 10000, 셋째 문단은 둘째 단 맨 위 0(종전엔 칸 폭 22000 으로 채우고 이어서 아래로)
    assert.deepEqual(first.map(s => [Number(s.getAttribute("vertpos")), Number(s.getAttribute("horzsize"))]), [[0, 10000], [1600, 10000], [0, 10000]])
  })
  it("칸 안 위아래 배치 표 바닥은 다음 문단의 하한 — 호스트 아래 간격을 더하지 않는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:next value="300" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="100" bottom="100"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const paras = `<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0">${inner}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p>`
    const outer = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="20000" height="9000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="9000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${outer}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => { const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!; return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")) })
    assert.deepEqual(vps, [0, 3200]) // 표 바닥 100 + 3000 + 100(종전엔 아래 간격 300 을 더해 3500)
  })
  it("칸 안 위아래 배치 표의 호스트가 공백뿐이면 그 줄은 표 아래로 내려간다", () => {
    const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="100" bottom="100"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const vps = (host: string) => {
      const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t>${host}</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p>`
      const outer = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="20000" height="9000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="20000" height="9000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${outer}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
      return Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => {
        const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
        return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
      })
    }
    assert.deepEqual(vps("   "), [0, 4800, 6400]) // 공백 호스트 줄 = 1600 + 100 + 3000 + 100, 다음 문단은 그 줄 뒤
    assert.deepEqual(vps(""), [0, 1600, 4800]) // 빈 호스트는 줄이 제자리, 다음 문단이 표 아래
  })
  it("칸 안 나눔에서 위아래 배치 표에 밀려 넘어간 문단은 새 쪽 0 에서 시작한다", () => {
    const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="8500"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="8500"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t>호스트</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p>`
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="16000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="16000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 9000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => {
      const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
      return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    })
    assert.deepEqual(vps, [0, 0]) // 다음 문단은 표 바닥 8500 + 1000 > 9000 이라 넘어가고, 표 몫 없이 0(종전엔 8500 − 1600 = 6900)
  })
  it("칸 안 나눔에서 앞 문단의 아래 간격은 다음 쪽에 남지 않는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:next value="1000" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const paras = Array.from({ length: 6 }, (_, i) => `<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>칸${i}</hp:t></hp:run></hp:p>`).join("")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="16000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="16000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 9000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => Number((q.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")))
    // 문단 간격 2600(줄 1000 + 간격 600 + 아래 1000): 0·2600·5200·7800 뒤 다음 쪽 첫 줄은 0(종전엔 앞 문단 아래 간격 1000)
    assert.deepEqual(vps, [0, 2600, 5200, 7800, 0, 2600])
  })
  it("칸 안 나눔의 이어지는 쪽에서 행을 가를 때는 쪽 바닥 100 안쪽에 닿는 줄도 다음 쪽으로", () => {
    const paras = Array.from({ length: 14 }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸${i}</hp:t></hp:run></hp:p>`).join("")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="30000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="30000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const vps = (bodyH: number) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: bodyH })
      const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
      return Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => Number((q.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")))
    }
    // 첫 쪽은 바닥에서 20 떨어진 줄(8000 + 1000 = 9020 − 20)까지, 이어지는 쪽은 그 줄을 다음 쪽으로(100 안쪽 — 종전엔 둘째 쪽도 8000 줄까지)
    assert.deepEqual(vps(9020), [0, 1600, 3200, 4800, 6400, 8000, 0, 1600, 3200, 4800, 6400, 0, 1600, 3200])
    // 첫 쪽도 바닥에서 20 안쪽에 닿는 줄은 다음 쪽(한컴 저장본: 남았을 여유 18 인 칸 줄이 다음 쪽 0)
    assert.deepEqual(vps(9010).slice(0, 7), [0, 1600, 3200, 4800, 6400, 0, 1600])
  })
  it("칸 안 나뉘는 표가 여러 쪽에 걸치면 마지막 쪽의 표 바닥 아래에서 다음 글이 이어진다", () => {
    const row = (r: number) => `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>행</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="25" colCnt="1"><hp:sz width="5000" height="25000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${Array.from({ length: 25 }, (_, i) => row(i)).join("")}</hp:tbl>`
    const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>뒤</hp:t></hp:run></hp:p>`
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="30000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="30000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 9020 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const ps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const lsa = Array.from(ps[1].childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    // 쪽마다 9행(9000) — 1·2쪽 18행, 3쪽 7행 뒤 7000(종전엔 남은 16행을 한 쪽에 쌓아 16000)
    assert.equal(Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")), 7000)
  })
  it("칸 안 나눔에서 쪽 바닥을 넘는 나뉘는 표는 드는 행만 남기고 나머지 행 아래에서 다음 글이 이어진다", () => {
    const row = (r: number) => `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="2000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const inner = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="2" colCnt="1"><hp:sz width="5000" height="4000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${row(0)}${row(1)}</hp:tbl>`
    const para = (body: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p>`
    const paras = Array.from({ length: 4 }, (_, i) => para(`<hp:t>앞${i}</hp:t>`)).join("") + para(`${inner}<hp:t/>`) + para("<hp:t>뒤</hp:t>")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="20000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="20000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 9000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => {
      const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
      return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    })
    // 표 6400~: 첫 행 8400 까지 이 쪽, 둘째 행(2000)은 다음 쪽 — 뒤 문단은 그 아래 2000(종전엔 표째 옮기고 이 쪽 8000)
    assert.deepEqual(vps, [0, 1600, 3200, 4800, 6400, 2000])
  })
  it("칸 안 나눔에서 쪽 바닥을 넘는 위아래 배치 그림은 다음 쪽 맨 위로 가고, 이 쪽 글은 밀리지 않는다", () => {
    const pic = `<hp:pic textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES"><hp:sz width="5000" height="7000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="500" horzRelTo="COLUMN" horzAlign="LEFT" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const para = (body: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p>`
    const paras = para("<hp:t>가</hp:t>") + para(`${pic}<hp:t>호스트</hp:t>`) + Array.from({ length: 5 }, (_, i) => para(`<hp:t>뒤${i}</hp:t>`)).join("")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="20000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="20000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 9020 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => {
      const lsa = Array.from(q.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
      return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    })
    // 그림 바닥 1600 + 500 + 7000 = 9100 > 9020 — 뒤 글은 3200 부터 쪽 바닥(첫 쪽 여유 20)까지, 넘친 문단은 다음 쪽 그림(7000, 오프셋 버림) 아래
    assert.deepEqual(vps, [0, 1600, 3200, 4800, 6400, 8000, 7000])
  })
  it("칸 안 나눔은 넘어간 조각을 자르기 직전 줄 끝 기준으로 잰다 — 문단 위 간격도 새 쪽에 남는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:prev value="1000" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const paras = Array.from({ length: 8 }, (_, i) => `<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>칸${i}</hp:t></hp:run></hp:p>`).join("")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="16000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="16000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 9000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => Number((q.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")))
    // 문단 간격 2600(위 1000 + 줄 1000 + 간격 600): 쪽마다 1000·3600·6200 — 넷째(8800 + 1000 > 9000)부터 다음 쪽
    assert.deepEqual(vps, [1000, 3600, 6200, 1000, 3600, 6200, 1000, 3600])
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    assert.equal(Number((ps[1].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")), 4600) // 마지막 조각 바닥 3600 + 1000
  })
  it("머리 행 반복 표는 새 쪽마다 머리 행 몫을 빼고 나눈다 — 쪽 나누기 문단의 긴 표도", () => {
    const row = (i: number, head: boolean) => `<hp:tr><hp:tc header="${head ? 1 : 0}"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${i}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const tbl = (rep: string) => `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="TABLE" repeatHeader="${rep}" rowCnt="10" colCnt="1"><hp:sz width="10000" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${Array.from({ length: 10 }, (_, i) => row(i, i === 0)).join("")}</hp:tbl>`
    const nextV = (rep: string, pageBreak: boolean) => {
      const head = pageBreak ? `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t></hp:run></hp:p>` : ""
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${head}<hp:p paraPrIDRef="0" pageBreak="${pageBreak ? 1 : 0}"><hp:run charPrIDRef="0">${tbl(rep)}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 7000 })
      const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
      return Number((ps[ps.length - 1].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(nextV("0", false), 3000) // 1쪽 7행, 2쪽 3행
    assert.equal(nextV("1", false), 4000) // 2쪽에 머리 행 1000 이 먼저 — 남은 3행은 그 아래
    assert.equal(nextV("1", true), 4000) // 쪽 나누기로 새 쪽에서 시작한 표도 그 쪽부터 나뉜다(종전엔 표째 한 쪽으로 쳤다)
  })
  it("칸 안에서 쪽이 갈린 칸의 줄은 새 쪽에서 0 부터 다시 적는다", () => {
    const paras = Array.from({ length: 10 }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸${i}</hp:t></hp:run></hp:p>`).join("")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="16000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="16000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 7000 })
    const sub = root.getElementsByTagName("hp:subList")[0] as unknown as Element
    const vps = Array.from(sub.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(q => Number((q.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")))
    // 줄 1000 + 간격 600: 쪽마다 0~4800 네 줄(6400 + 1000 > 7000 인 다섯째부터 다음 쪽), 새 쪽은 0 부터
    assert.deepEqual(vps, [0, 1600, 3200, 4800, 0, 1600, 3200, 4800, 0, 1600])
  })
  it("떠 있는 표가 나뉘어 시작된 새 쪽은 앞 쪽 각주를 각주 영역에 넣지 않는다", () => {
    const row = (i: number) => `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${i}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="TABLE" rowCnt="10" colCnt="1"><hp:sz width="10000" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${Array.from({ length: 10 }, (_, i) => row(i)).join("")}</hp:tbl>`
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>주</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    const after = (note: boolean) => {
      const tail = Array.from({ length: 4 }, (_, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>뒤${i}</hp:t></hp:run></hp:p>`).join("")
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t>${note ? fn : ""}</hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p>${tail}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 11000 })
      return Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").slice(2)
        .map(q => Number((q.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")))
    }
    // 각주 있는 1쪽은 바닥이 2417(850 + 567 + 1000) 올라 표가 6행에서 나뉜다 — 2쪽은 남은 4행 아래 4000 부터, 각주 없이 11000 까지
    assert.deepEqual(after(true), [4000, 5600, 7200, 8800]) // 앞 쪽 각주를 남겨 세면 8800 줄이 8583 을 넘어 셋째 쪽으로 갔다
  })
  it("칸 subList lineWrap=SQUEEZE 면 칸 글은 줄을 바꾸지 않는다(명시적 줄 나눔만)", () => {
    const cell = (wrap: string, inner: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:tbl rowCnt="1" colCnt="1"><hp:sz width="5000" height="1000"/><hp:pos treatAsChar="1"/><hp:tr><hp:tc><hp:subList lineWrap="${wrap}">${inner}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="5000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run></hp:p>`
    const lines = (wrap: string, t: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${cell(wrap, `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run></hp:p>`)}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
      return root.getElementsByTagName("hp:subList")[0].getElementsByTagName("hp:lineseg").length
    }
    assert.equal(lines("BREAK", "가".repeat(12)), 3) // 칸 폭 5000 에 1000 짜리 12자 — 세 줄
    assert.equal(lines("SQUEEZE", "가".repeat(12)), 1)
    assert.equal(lines("SQUEEZE", "가가<hp:lineBreak/>가가"), 2)
  })
  it("첫 빈 줄 감추기면 새 쪽 맨 위에 올 빈 문단은 앞 쪽 바닥 아래에 남고, 새 쪽은 다음 글부터", () => {
    const vps = (hide: string, n = 2) => {
      const filled = Array.from({ length: 4 }, () => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`).join("")
      const empty = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t> </hp:t></hp:run></hp:p>`
      const sec = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:visibility hideFirstEmptyLine="${hide}"/></hp:secPr><hp:t>가</hp:t></hp:run></hp:p>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${sec}${filled}${empty.repeat(n)}<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 8500 })
      return Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos")))
    }
    // 줄 1000·간격 600: 다섯 줄 0~6400, 빈 문단 8000(8000 + 1000 > 8500) 부터 넘친다
    // 빈 문단 둘은 앞 쪽 바닥 아래에 높이 없이 겹치고(한컴 저장본 56197·56197), "다음" 이 새 쪽 맨 위
    assert.deepEqual(vps("1").slice(5), [8000, 8000, 0])
    assert.deepEqual(vps("0").slice(5), [0, 1600, 3200]) // 감추지 않으면 빈 문단부터 새 쪽
    assert.deepEqual(vps("1", 3).slice(5), [8000, 8000, 0, 1600]) // 감추는 건 둘까지 — 셋째 빈 문단은 새 쪽 맨 위
  })
  it("쪽보다 높은 줄은 제자리에 두되, 쪽 바닥 아래에서 시작하면 새 쪽 맨 위로", () => {
    const tall = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="9000"/><hp:pos treatAsChar="1" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="9000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl><hp:t/></hp:run></hp:p>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${tall}${tall}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 8500 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    const v = (p: Element) => Number((Array.from(p.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    assert.deepEqual(ps.map(v), [0, 0]) // 첫 표(9000 > 8500)는 0 에, 둘째는 첫 표 아래(쪽 바닥 밑)에서 시작하므로 새 쪽 0
  })
  it("칸 안 나눔(CELL) 떠 있는 표는 행을 칸 줄 경계에서 갈라 남은 줄을 다음 쪽 맨 위에 — 다음 문단은 그 아래", () => {
    // 한 칸에 한 줄 문단 10개(줄 1000, 간격 600 → 줄 위 0·1600·…·14400), 칸 여백 141 — 행 15400 + 282
    const paras = Array.from({ length: 10 }, () => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`).join("")
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="1000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="141"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 7000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    // 1쪽: 141 + 줄 바닥 ≤ 7000 − 141 − 141 인 줄 4개(바닥 5800). 2쪽: 6400 부터 4줄(바닥 12200), 3쪽: 12800 부터 2줄 → 15400 − 12800 + 282 + 141
    assert.equal(Number((ps[1].getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos")), 3023)
  })
  it("칸 간격(cellSpacing) 표를 칸 안 나눔으로 가르면 쪽마다 조각 위아래 간격만큼 일찍 끊긴다", () => {
    const cellV = (sp: number) => {
      const paras = Array.from({ length: 10 }, () => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`).join("")
      const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1" cellSpacing="${sp}"><hp:sz width="10000" height="1000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="141"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 7000 })
      return Array.from(root.getElementsByTagName("hp:subList")[0].getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos")))
    }
    // 간격 0: 1쪽 4줄(바닥 5800 ≤ 7000 − 141 − 141 − 141). 간격 400: 위아래 400 씩 빠져 바닥 5777 까지 — 넷째 줄(5800)부터 다음 쪽
    assert.deepEqual(cellV(0).slice(0, 5), [0, 1600, 3200, 4800, 0])
    assert.deepEqual(cellV(400).slice(0, 4), [0, 1600, 3200, 0])
  })
  it("미주는 본문 끝에서 단 높이로 흘러, 단 바닥을 넘는 줄부터 다음 단 맨 위 0 에서 다시 센다", () => {
    const note = (k: number) => `<hp:ctrl><hp:endNote number="${k}"><hp:subList>${`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`.repeat(k === 1 ? 5 : 2)}</hp:subList></hp:endNote></hp:ctrl>`
    const sec = `<hp:secPr><hp:endNotePr><hp:noteSpacing betweenNotes="500" belowLine="300" aboveLine="200"/></hp:endNotePr></hp:secPr>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${sec}${note(1)}${note(2)}<hp:t>가</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 5000 })
    const notes = Array.from(root.getElementsByTagName("hp:endNote") as unknown as Element[]).map(en => Array.from(en.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos"))))
    // 본문 줄 바닥 1000 + 구분선 위 200 + 아래 300 = 1500 에서 시작(줄 1000·간격 600): 1500·3100 은 들고 4700 + 1000 > 5000 부터 다음 단 0.
    // 첫 단 조각은 미주 첫 줄 기준 — 0·1600, 넘긴 뒤는 단 맨 위 기준 0·1600·3200
    assert.deepEqual(notes[0], [0, 1600, 0, 1600, 3200])
    // 둘째 미주는 3200 + 1000 + 미주 사이 500 = 4700 에서 첫 줄부터 넘쳐 다음 단 맨 위에서
    assert.deepEqual(notes[1], [0, 1600])
  })
  it("미주의 위아래 배치 개체가 단 바닥을 넘으면 다음 단 맨 위로 — 이 단의 뒤 글은 개체에 밀리지 않는다", () => {
    const vps = (bodyH: number) => {
      const para = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`
      const pic = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run></hp:p>`
      const note = `<hp:ctrl><hp:endNote number="1"><hp:subList>${para}${pic}${para}${para}</hp:subList></hp:endNote></hp:ctrl>`
      const sec = `<hp:secPr><hp:endNotePr><hp:noteSpacing betweenNotes="500" belowLine="0" aboveLine="0"/></hp:endNotePr></hp:secPr>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${sec}${note}<hp:t>가</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: bodyH })
      return Array.from(root.getElementsByTagName("hp:endNote")[0].getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos")))
    }
    // 미주는 본문 바닥 1000 에서: 줄 0·호스트 1600(그림 1600~4600)·그림 아래 4600·6200 (줄 1000·간격 600)
    assert.deepEqual(vps(100000), [0, 1600, 4600, 6200])
    // 단 5300: 호스트 줄(2600~3600)은 들고 그림 바닥 5600 이 넘친다 — 그림은 다음 단 맨 위(0~3000), 뒤 줄은 밀리지 않은 3200 에 남고
    // 그다음 줄이 다음 단 그림 아래 3000 에서
    assert.deepEqual(vps(5300), [0, 1600, 3200, 3000])
    // 단 5000: 밀리지 않은 줄도 넘쳐(4200 + 1000 > 5000) 다음 단 그림 아래 3000 부터, 그다음 줄(4600 + 1000 > 5000)은 그다음 단 0
    assert.deepEqual(vps(5000), [0, 1600, 3000, 0])
  })
  it("쪽에서 갈리는 떠 있는 표의 칸 안 각주는 앵커 줄과 함께 세지 않고, 행이 놓인 쪽의 각주로 센다", () => {
    const vps = () => {
      const para = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`
      const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList>${para}</hp:subList></hp:footNote></hp:ctrl>`
      const tc = (r: number) => `<hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${r === 2 ? fn : ""}<hp:t>가</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
      const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="3" colCnt="1"><hp:sz width="10000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${[0, 1, 2].map(r => `<hp:tr>${tc(r)}</hp:tr>`).join("")}</hp:tbl>`
      const sec = `<hp:secPr><hp:footNotePr><hp:noteSpacing betweenNotes="0" belowLine="0" aboveLine="0"/></hp:footNotePr></hp:secPr>`
      const first = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${sec}<hp:t>가</hp:t></hp:run></hp:p>`
      const host = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${first}${para.repeat(3)}${host}${para.repeat(4)}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 8000 })
      return Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => Number((Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).filter(s => s.parentNode?.parentNode === p)[0])?.getAttribute("vertpos")))
    }
    // 각주(1000)는 셋째 행 칸 안 — 빈 앵커 줄 6400(바닥 7400)은 각주와 함께 안 재 제자리, 표는 첫 행만 이 쪽(7400), 둘째·셋째 행은 다음 쪽 0~2000.
    // 다음 쪽은 셋째 행의 각주 몫만큼 바닥이 8000 → 7000 — 뒤 문단 2000·3600·5200, 6800(+ 1000 > 7000)은 그다음 쪽
    assert.deepEqual(vps(), [0, 1600, 3200, 4800, 6400, 2000, 3600, 5200, 0])
  })
  it("갈리는 표의 칸 안 각주는 본문이 먼저 — 쪽의 첫 각주만 앞 두 줄 몫으로 바닥을 올린다", () => {
    const para = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`
    const fn = (lines: number) => `<hp:ctrl><hp:footNote number="1"><hp:subList>${para.repeat(lines)}</hp:subList></hp:footNote></hp:ctrl>`
    const tc = (r: number) => `<hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${r === 0 ? fn(4) : r === 1 ? fn(2) : ""}<hp:t>가</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="2000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="TABLE" rowCnt="5" colCnt="1"><hp:sz width="10000" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${[0, 1, 2, 3, 4].map(r => `<hp:tr>${tc(r)}</hp:tr>`).join("")}</hp:tbl>`
    const sec = `<hp:secPr><hp:footNotePr><hp:noteSpacing betweenNotes="0" belowLine="0" aboveLine="0"/></hp:footNotePr></hp:secPr>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${sec}<hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p>${para}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 12000 })
    const vps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => Number((Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).filter(s => s.parentNode?.parentNode === p)[0])?.getAttribute("vertpos")))
    // 첫 각주(네 줄, 줄 1000·간격 600)는 앞 두 줄 2600 만 첫 쪽 바닥을 올리고(12000 → 9400), 둘째 각주는 바닥을 안 올린다 —
    // 행 바닥 3600·5600·7600 까지 첫 쪽, 넷째 행(9600 > 9400)부터 다음 쪽 0~4000
    assert.deepEqual(vps, [0, 1600, 4000])
  })
  it("쪽 내용 바닥 아래에 다 안 드는 각주는 남는 몫이 다음 쪽 각주 영역으로 이어진다", () => {
    const para = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList>${para.repeat(12)}</hp:subList></hp:footNote></hp:ctrl>`
    const sec = `<hp:secPr><hp:footNotePr><hp:noteSpacing betweenNotes="0" belowLine="0" aboveLine="0"/></hp:footNotePr></hp:secPr>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${sec}${fn}<hp:t>가</hp:t></hp:run></hp:p>${para.repeat(3)}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const vps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => Number((Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).filter(s => s.parentNode?.parentNode === p)[0])?.getAttribute("vertpos")))
    // 각주 18600(열두 줄)은 첫 쪽 내용 바닥 1000 아래 9000 에 안 들어 9600 이 다음 쪽으로 — 둘째 쪽 바닥 400 이라 첫 줄만,
    // 셋째 쪽은 남은 600 만 각주라 그다음 줄 1600 까지 든다(종전엔 둘째 쪽부터 각주 없이 0·1600·3200)
    assert.deepEqual(vps, [0, 0, 0, 1600])
  })
  it("글머리표 문단인 빈 호스트의 떠 있는 위아래 배치 표는 줄이 표 아래로 간다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:heading type="BULLET" idRef="1" level="0"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties>`)
      .replace("<hh:charProperties>", `<hh:bullets itemCnt="1"><hh:bullet id="1" char="가" useImage="0"><hh:paraHead level="0" autoIndent="1" textOffsetType="PERCENT" textOffset="50" charPrIDRef="4294967295"/></hh:bullet></hh:bullets><hh:charProperties>`)
    const vps = (pp: number) => {
      const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="${pp}"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 60000 })
      return Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => Number((Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).filter(s => s.parentNode?.parentNode === p)[0])?.getAttribute("vertpos")))
    }
    assert.deepEqual(vps(0), [0, 1600, 4600]) // 글머리표 없는 빈 호스트: 줄은 표 위(제자리), 다음 문단이 표 아래
    assert.deepEqual(vps(1), [0, 4600, 6200]) // 글머리표 빈 호스트: 줄이 표 아래 4600, 다음 문단은 그 줄 다음
  })
  it("쪽 바닥을 넘어 다음 쪽으로 옮겨 간 어울림 그림은 세로 오프셋 없이 그 쪽 위를 막는다", () => {
    const pic = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="20000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" horzAlign="LEFT" vertOffset="1000" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const para = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`
    const host = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>가</hp:t></hp:run></hp:p>`
    const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${para.repeat(5)}${host}${para.repeat(4)}</hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
    const segs = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => (Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]))[0])
    // 그림(오프셋 1000, 9000~12000)은 쪽 바닥 10000 을 넘어 다음 쪽 0~3000 을 막는다 — 0·1600 줄은 그림 오른쪽, 3200 줄은 온 폭(종전엔 오프셋까지 4000)
    assert.deepEqual(segs.map(s => [Number(s.getAttribute("vertpos")), Number(s.getAttribute("horzpos"))]).slice(6), [[0, 20000], [1600, 20000], [3200, 0], [4800, 0]])
  })
  it("앞 문단 어울림 개체 옆 틈에 안 드는 인라인 개체로 시작하는 문단은 개체 아래에서 시작한다", () => {
    const pic = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="20000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const tbl = (w: number) => `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="${w}" height="1000"/><hp:pos treatAsChar="1" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${w}" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const v = (w: number) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl(w)}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 60000 })
      const p1 = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")[1]
      const lsa = Array.from(p1.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
      return Number((lsa.getElementsByTagName("hp:lineseg")[0] as unknown as Element).getAttribute("vertpos"))
    }
    assert.equal(v(30000), 5000) // 틈 22000 에 폭 30000 표가 안 들어 그림 바닥 5000 부터
    assert.equal(v(15000), 1600) // 드는 표는 그림 옆 제자리
  })
  it("문단 여백 unit=\"CHAR\" 값은 5배를 HWPUNIT 으로 읽는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="400" unit="CHAR"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="53" unit="CHAR"/><hc:next value="0" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const g = parseRenderStyles(head).paraGeom.get("1")!
    assert.deepEqual([g.marginLeft, g.spaceBefore], [2000, 265]) // 한컴 저장본: 왼쪽 400 → horzpos 2000, 위 간격 53 → 첫 줄 265
  })
  it("글자처럼 취급하는 수식은 outMargin 좌우까지 폭으로 친다", () => {
    const eq = (om: number) => `<hp:equation baseLine="85"><hp:sz width="900" height="1000"/><hp:pos treatAsChar="1"/><hp:outMargin left="${om}" right="${om}" top="0" bottom="0"/><hp:script>x</hp:script></hp:equation>`
    const lines = (om: number) => reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(41)}</hp:t>${eq(om)}</hp:run></hp:p>`)[0].length
    assert.equal(lines(0), 1) // 41000 + 900 ≤ 42000
    assert.equal(lines(56), 2) // 41000 + 56 + 900 + 56 > 42000 — 종전엔 표만 outMargin 을 셌다
  })
  it("각주·미주 본문 참조 번호는 글자 크기의 3/4 로 그 글 폭을 차지한다", () => {
    const fn = `<hp:ctrl><hp:footNote number="1"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>주</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    const body = (tail: string) => reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(40)}</hp:t>${fn}<hp:t>${tail}</hp:t></hp:run></hp:p>`)[0].length
    // 남은 2000 에 3/4 크기 "1)"(724)
    assert.equal(body(")))"), 1) // + ")))"(1128) 은 든다 — 본래 크기(972)면 넘친다
    assert.equal(body("가)"), 2) // + "가)"(1376) 는 넘친다 — 위첨자 16/25(620)면 들었다
  })
  it("줄 간격 몫은 4 단위로 0에서 먼 쪽 반올림 — 100% 미만이면 음수로 겹쳐 올라온다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:lineSpacing type="PERCENT" value="155"/></hh:paraPr><hh:paraPr id="2"><hh:align horizontal="LEFT"/><hh:lineSpacing type="PERCENT" value="90"/></hh:paraPr></hh:paraProperties>`)
      .replace(`<hh:charPr id="1" height="1000">`, `<hh:charPr id="2" height="1400"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="3" height="1500"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="4" height="1250"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="1" height="1000">`)
    const vert = (pp: number, cpr: number) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="${pp}"><hp:run charPrIDRef="${cpr}"><hp:t>${"가".repeat(60)}</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      return Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => [Number(s.getAttribute("vertpos")), Number(s.getAttribute("spacing"))])
    }
    assert.deepEqual(vert(1, 2).slice(0, 2), [[0, 772], [2172, 772]]) // 1400 × 55% = 770 → 772
    assert.equal(vert(0, 4)[0][1], 748) // ⌊1250/4⌋ = 312 × 60% = 187.2 → 4 × 187 — 1250 × 60% = 750 이 아니다
    const v90 = vert(2, 3)
    assert.deepEqual(v90[0], [0, -152]) // 1500 × −10% = −150 → −152
    assert.equal(v90[v90.length - 1][0], v90[v90.length - 2][0] + 1500 - 152) // 다음 문단도 음수 몫만큼 올라온다
  })
  it("줄 높이·기준선은 그 줄의 가장 큰 글자·개체로 — 수식은 baseLine%, 세로 가운데 정렬은 줄 가운데, 아래 정렬은 줄 바닥", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT" vertical="CENTER"/></hh:paraPr><hh:paraPr id="2"><hh:align horizontal="LEFT" vertical="BOTTOM"/></hh:paraPr></hh:paraProperties>`)
      .replace(`<hh:charPr id="1" height="1000">`, `<hh:charPr id="2" height="1500"><hh:fontRef hangul="0" latin="0"/></hh:charPr><hh:charPr id="1" height="1000">`)
    const segs = (body: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      return Array.from(root.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => ["vertsize", "baseline", "spacing"].map(a => Number(s.getAttribute(a))))
    }
    // 글자 1000 run + 문단 끝 빈 1500 run → 줄 높이 1500, 간격 몫도 1500 기준(160% → 900)
    assert.deepEqual(segs(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나</hp:t></hp:run><hp:run charPrIDRef="2"><hp:t/></hp:run></hp:p>`), [[1500, 1275, 900]])
    const eq = (h: number, bl: number) => `<hp:equation baseLine="${bl}"><hp:sz width="1000" height="${h}"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:script>x</hp:script></hp:equation>`
    // 수식 1650@51·1050@88: 높이는 1650(합 아님), 기준선은 윗부분 최대 round(1050 × 0.88) = 924
    assert.deepEqual(segs(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${eq(1650, 51)}${eq(1050, 88)}<hp:t/></hp:run></hp:p>`)[0].slice(0, 2), [1650, 924])
    assert.deepEqual(segs(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>가나</hp:t></hp:run></hp:p>`)[0].slice(0, 2), [1000, 500]) // 세로 가운데
    assert.deepEqual(segs(`<hp:p paraPrIDRef="2"><hp:run charPrIDRef="0"><hp:t>가나</hp:t></hp:run></hp:p>`)[0].slice(0, 2), [1000, 1000]) // 세로 아래 — 줄 바닥
  })
  it("쪽 넘김은 줄 단위 — 넘친 줄부터 새 쪽 0, 문단째 넘길 땐 문단 위 간격을 남기고, 외톨이줄 보호면 첫 줄만 남기지 않는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD" widowOrphan="1"/></hh:paraPr><hh:paraPr id="2"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:prev value="800"/></hh:margin></hp:case></hp:switch></hh:paraPr></hh:paraProperties>`)
    const vps = (body: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 10000 })
      return Array.from(root.getElementsByTagName("hp:p") as unknown as Element[]).map(p => Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos"))))
    }
    const para = (pp: number, n: number) => `<hp:p paraPrIDRef="${pp}"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(42 * n)}</hp:t></hp:run></hp:p>`
    // 줄 pitch 1600: 앞 문단 5줄(0~6400) 뒤 3줄 문단 — 8000·9600(+1000 > 10000) → 9600 줄부터 새 쪽
    assert.deepEqual(vps(para(0, 5) + para(0, 3))[1], [8000, 0, 1600])
    assert.deepEqual(vps(para(0, 5) + para(1, 3))[1], [0, 1600, 3200]) // 외톨이줄 보호 — 첫 줄 하나만 남기지 않는다
    assert.deepEqual(vps(para(0, 6) + para(2, 1))[1], [800]) // 9600 + 800 넘침 → 새 쪽, 문단 위 간격 800 은 남는다
  })
  it("서울한강체는 PDF 실측 폭표 — 한글 글자마다 850~920, 숫자 540", async () => {
    const T = await import("../src/hwpx/text-metrics.js")
    const fc = T.faceClassForReflow("08서울한강체 L")
    assert.deepEqual(["가", "리", "1", "("].map(c => T.hancomCharWidth(c, 1000, 100, 0, fc)), [912, 852, 540, 336])
  })
  it("HYSinMyeongJo-Medium 괄호·숫자, KoPub돋움 가운뎃점은 한컴 PDF /W 폭", async () => {
    const T = await import("../src/hwpx/text-metrics.js")
    const hy = T.faceClassForReflow("HYSinMyeongJo-Medium"), kp = T.faceClassForReflow("KoPub돋움체 Light")
    assert.deepEqual(["(", ")", ",", "0"].map(c => T.hancomCharWidth(c, 1000, 100, 0, hy)), [500, 500, 292, 624])
    assert.equal(T.hancomCharWidth("·", 1000, 100, 0, kp), 452)
  })
  it("문단 번호 — 수준별로 문서 순서대로 세고, 머리 글 폭 + 간격만큼 좁게 채운다", async () => {
    const { nextParaNumber, formatHeadNumber } = await import("../src/render/para-number.js")
    const { DEFAULT_PARA_GEOM: DEFAULT_GEOM } = await import("../src/render/head-styles.js")
    assert.deepEqual([1, 2, 14, 15].map(n => formatHeadNumber(n, "HANGUL_SYLLABLE")), ["가", "나", "하", "가"])
    assert.equal(formatHeadNumber(3, "CIRCLED_DIGIT"), "③")
    assert.equal(formatHeadNumber(4, "ROMAN_CAPITAL"), "IV")
    const heads = new Map([[1, { text: "^1.", format: "DIGIT", start: 1 }], [2, { text: "^1.^2)", format: "HANGUL_SYLLABLE", start: 1 }]])
    const g = (level: number) => ({ ...DEFAULT_GEOM, number: { id: "1", level, heads, offset: 50, offsetPct: true, autoIndent: true } })
    const c = new Map()
    assert.deepEqual([g(1), g(2), g(2), g(1), g(2)].map(x => nextParaNumber(c, x)), ["1.", "1.가)", "1.나)", "2.", "2.가)"])
    // 수준 숫자 없는 ^ 는 찍지 않는다 — 머리 "^  □" 는 "  □"
    const lone = new Map([[1, { text: "^  □", format: "DIGIT", start: 1 }]])
    assert.equal(nextParaNumber(new Map(), { ...DEFAULT_GEOM, number: { id: "2", level: 1, heads: lone, offset: 50, offsetPct: true, autoIndent: true } }), "  □")
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:heading type="NUMBER" idRef="1" level="0"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties>`)
      .replace("<hh:charProperties>", `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" autoIndent="1" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295">가^1</hh:paraHead></hh:numbering></hh:numberings><hh:charProperties>`)
    // 머리 "가1" — 바탕 한글 1000 + 숫자 + 간격 500 → 첫 줄과 둘째 줄 모두 42자 미만
    const [p] = reflowed(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(90)}</hp:t></hp:run></hp:p>`, 42000, head)
    assert.ok(p[1][0] < 42 && p[2][0] - p[1][0] < 42, JSON.stringify(p.map(s => s[0])))
  })
  it("문단 보호·다음 문단과 함께·문단 앞 쪽 나눔", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD" keepLines="1"/></hh:paraPr><hh:paraPr id="2"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD" keepWithNext="1"/></hh:paraPr><hh:paraPr id="3"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD" pageBreakBefore="1"/></hh:paraPr></hh:paraProperties>`)
    const vps = (body: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 10000 })
      return Array.from(root.getElementsByTagName("hp:p") as unknown as Element[]).map(p => Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).map(s => Number(s.getAttribute("vertpos"))))
    }
    const para = (pp: number, n: number) => `<hp:p paraPrIDRef="${pp}"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(42 * n)}</hp:t></hp:run></hp:p>`
    assert.deepEqual(vps(para(0, 5) + para(1, 3))[1], [0, 1600, 3200]) // 쪽에 걸칠 문단을 통째로
    assert.deepEqual(vps(para(0, 5) + para(2, 1) + para(0, 3)).slice(1), [[0], [1600, 3200, 4800]]) // 다음 문단 첫 줄이 넘치면 앞 문단도 함께 새 쪽
    assert.deepEqual(vps(para(0, 1) + para(3, 1))[1], [0])
  })
  it("떠 있는 위아래 개체 — 글 없는 문단은 줄이 제자리·개체가 다음 문단을 밀고, 쪽 아래에 붙은 개체는 그 쪽 바닥을 올린다", () => {
    const fl = (h: number, rel: string, align: string) => `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="${h}"/><hp:pos treatAsChar="0" vertRelTo="${rel}" vertAlign="${align}" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSz width="10000" height="${h}"/></hp:tc></hp:tr></hp:tbl>`
    const vps = (body: string) => {
      const doc = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml")
      const root = doc.documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 10000 })
      return Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => Array.from(p.getElementsByTagName("hp:lineseg") as unknown as Element[]).filter(sg => (sg.parentNode as Element).parentNode === p).map(sg => Number(sg.getAttribute("vertpos"))))
    }
    const text = (t: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run></hp:p>`
    assert.deepEqual(vps(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${fl(3000, "PARA", "TOP")}<hp:t/></hp:run></hp:p>${text("다음")}`), [[0], [3000]])
    assert.deepEqual(vps(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${fl(3000, "PARA", "TOP")}<hp:t>글</hp:t></hp:run></hp:p>`), [[3000]])
    assert.deepEqual(vps(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${fl(3000, "PAGE", "TOP")}<hp:t>글</hp:t></hp:run></hp:p>`), [[3000]]) // 쪽 위에 붙은 표 아래부터
    // 인라인 그림도 줄 내용 — 떠 있는 표 아래로 내려간다(한컴 저장본 보도자료 머리: 인라인 표 줄 5307 = 떠 있는 표 4741 + 바깥 566)
    const inl = `<hp:pic><hp:sz width="2000" height="1000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    assert.deepEqual(vps(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${fl(3000, "PARA", "TOP")}${inl}<hp:t/></hp:run></hp:p>`), [[3000]])
    // 앵커 글자가 둘째 줄에 있는 개체는 그 줄 위에 끼고, 첫 줄은 제자리(한컴 저장본 연락처 문단: 첫 줄 56218, 둘째 줄 = 첫 줄 끝 + 개체 4330)
    assert.deepEqual(vps(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(43)}</hp:t>${fl(3000, "PARA", "TOP")}<hp:t>나</hp:t></hp:run></hp:p>`), [[0, 4600]])
    // 글 시작보다 아래(vertOffset 2000)에 놓인 개체는 글을 밀지 않고 띠가 된다 — 띠(2000~5000)와 겹치는 줄부터 띠 아래, 다음 문단도 그 아래
    const low = fl(3000, "PARA", "TOP").replace(`vertOffset="0"`, `vertOffset="2000"`)
    assert.deepEqual(vps(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${low}<hp:t>${"가".repeat(42 * 3)}</hp:t></hp:run></hp:p>${text("다음")}`), [[0, 5000, 6600], [8200]])
    // 줄 pitch 1600: 앞 문단 4줄(0~4800) 다음, 쪽 아래 표 4000 이 붙은 문단 6400 + 1000 + 600 > 10000 − 4000 → 새 쪽
    assert.deepEqual(vps(text("가".repeat(42 * 4)) + `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${fl(4000, "PAGE", "BOTTOM")}<hp:t>결재</hp:t></hp:run></hp:p>`)[1], [0])
  })
  it("2단 구역의 각주는 단 폭으로 채운다", () => {
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr colCount="2" sameSz="1" sameGap="2000"/></hp:ctrl><hp:ctrl><hp:footNote><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(30)}</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl><hp:t>본문</hp:t></hp:run></hp:p>`
    const ps = reflowed(body)
    assert.deepEqual(ps[1].map(s => s[1]), [20000, 20000])
  })
  it("어울림 그림 옆 줄은 그림 폭 + 바깥 여백만큼 좁아지고, 그림 아래부터는 본문 폭", () => {
    const pic = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="12000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="1000" top="0" bottom="0"/></hp:pic>`
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>${"가".repeat(90)}</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(50)}</hp:t></hp:run></hp:p>`
    const [p1, p2] = reflowed(body)
    // 줄 간격 1600 — 0·1600·3200·4800 줄이 그림(0~5000)과 겹친다: 4줄 × 29자 > 90자
    assert.deepEqual(p1.map(s => [s[1], s[2]]), [[29000, 13000], [29000, 13000], [29000, 13000], [29000, 13000]].slice(0, p1.length))
    assert.ok(p1.length >= 3)
    assert.deepEqual([...new Set(p2.map(s => s[1]))], [42000])
  })
  it("위첨자는 크기 16/25 로 잰다", () => {
    const sup = (n: number) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="1"><hp:t>${"가".repeat(n)}</hp:t></hp:run></hp:p>`
    assert.deepEqual(reflowed(sup(70))[0].map(s => s[0]), [0, 65]) // 4·MulDiv(1000, ⌊640/4⌋, 1000) = 640 → 42000 ÷ 640 = 65자
  })
  it("공백에서 이미 줄 폭에 닿았으면 줄이 끝나고, 공백은 두 칸까지만 남는다", () => {
    const text = "가가 " + "나".repeat(3) + "      다다"
    const widths = [...text].map(c => (c === " " ? 50 : 100))
    // "가가 나나나" = 550 ≥ 550 → 첫 공백에서 줄 끝, 공백 둘은 남고 셋째부터 다음 줄
    assert.deepEqual(wrap(text, 550, 550, 1000, 100, "charAll", { widths, kinsoku: "hancom" }).starts, [0, 8])
    // condense 로 남는 폭이 있어도 다음 낱말은 새로 시작하지 못한다
    const t2 = "가가 나나 다다"
    const w2 = [...t2].map(c => (c === " " ? 50 : 100))
    assert.deepEqual(wrap(t2, 440, 440, 1000, 100, "charAll", { widths: w2, condensePct: 100, kinsoku: "hancom" }).starts, [0, 6])
  })
  it("breakLatinWord=BREAK_WORD 면 영문 단어도 글자 단위로 끊는다 (한컴 저장본 좁은 칸 \"Unit P|rice\")", () => {
    const text = "Unit Price", widths = [...text].map(() => 500)
    assert.deepEqual(wrap(text, 3344, 3344, 1000, 100, "keep", { widths, kinsoku: "hancom" }).starts, [0, 5])
    assert.deepEqual(wrap(text, 3344, 3344, 1000, 100, "keep", { widths, kinsoku: "hancom", latinBreak: true }).starts, [0, 6])
  })
  it("한컴 사용자 기호(보충 사용 영역)는 폭표 글꼴에서도 반각 0.5em", () => {
    const sym = String.fromCodePoint(0xf080f) // HWP3 기호 글자
    for (const face of ["한양신명조", "명조", "함초롬바탕"]) assert.equal(hancomCharWidth(sym, 1000, 100, 0, faceClassForReflow(face)), 500, face)
  })
  it("내어쓰기로 남는 폭이 한 글자도 안 되면 둘째 줄부터도 온 폭으로 채운다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:margin><hc:intent value="-10000" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties>`)
    const [p] = reflowed(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(12)}</hp:t></hp:run></hp:p>`, 8000, head)
    assert.deepEqual(p.map(sg => sg[0]), [0, 8]) // 종전엔 폭 500 으로 묶여 [0, 8, 9, 10, 11]
  })
  it("용지 기준 어울림 그림 옆 줄은 그림 오른쪽(바깥 여백 포함)부터 남는 폭으로 찬다", () => {
    const head = HEAD
    const pic = `<hp:pic id="1" textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="20000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" horzAlign="LEFT" vertOffset="5668" horzOffset="8504"/><hp:outMargin left="500" right="500" top="0" bottom="0"/></hp:pic>`
    const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="59528" height="84188"><hp:margin left="8504" right="8504" top="5668" bottom="4252" header="0" footer="0" gutter="0"/></hp:pagePr></hp:secPr>${pic}<hp:t>${"가".repeat(60)}</hp:t></hp:run></hp:p></hs:sec>`
    const doc = createXmlParser().parseFromString(xml, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42520, BODY_H: 70000 })
    const segs = Array.from(root.getElementsByTagName("hp:lineseg")).map(s => [Number(s.getAttribute("horzpos")), Number(s.getAttribute("horzsize"))])
    assert.deepEqual(segs[0], [21000, 21520]) // 그림 0 + 바깥 500 + 20000 + 500 = 21000 부터 42520 − 21000
  })
  it("줄 간격에 영향을 주는 글자처럼 취급한 표는 줄 간격 %를 표까지 든 줄 높이에 곱한다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="2"><hh:align horizontal="LEFT"/><hh:lineSpacing type="PERCENT" value="140"/></hh:paraPr></hh:paraProperties>`)
    const tbl = (ls: string) => `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="10000" height="20000"/><hp:pos treatAsChar="1" affectLSpacing="${ls}" vertRelTo="PARA" horzRelTo="PARA"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="20000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const sp = (ls: string) => {
      const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="2"><hp:run charPrIDRef="0">${tbl(ls)}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      return Array.from(root.getElementsByTagName("hp:lineseg")).filter(s => (s.parentNode!.parentNode as Element).getAttribute("paraPrIDRef") === "2")[0].getAttribute("spacing")
    }
    assert.deepEqual([sp("1"), sp("0")], ["8000", "400"]) // 20000 × 40% / 글자 1000 × 40%
  })
  it("쪽 바닥을 넘는 어울림 그림은 다음 쪽 위로 옮겨 그 쪽 줄을 좁힌다", () => {
    const pic = `<hp:pic id="1" textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="20000" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="22000"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(30)}</hp:t></hp:run></hp:p></hs:sec>`
    const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 4000 })
    const last = Array.from(root.getElementsByTagName("hp:p"))[2]
    const seg = last.getElementsByTagName("hp:lineseg")[0]
    assert.deepEqual([seg.getAttribute("vertpos"), seg.getAttribute("horzsize")], ["0", "22000"]) // 새 쪽 첫 줄이 그림 왼쪽 22000 폭으로
  })
  it("양쪽에 1440 이상 남긴 어울림 그림 옆 한 줄 문단은 왼쪽 조각과 오른쪽 빈 조각 두 줄이다", () => {
    const segsOf = (left: number, txt: string) => {
      const pic = `<hp:pic id="1" textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="20000" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="${left}"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
      const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>가</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${txt ? `<hp:t>${txt}</hp:t>` : ""}</hp:run></hp:p></hs:sec>`
      const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 60000 })
      return Array.from(Array.from(root.getElementsByTagName("hp:p"))[1].getElementsByTagName("hp:lineseg")).map(sg => ["textpos", "horzpos", "horzsize"].map(a => Number(sg.getAttribute(a))))
    }
    assert.deepEqual(segsOf(1440, ""), [[0, 0, 1440], [1, 21440, 20560]]) // 빈 문단 — 왼쪽 1440 조각 + 문단 끝 다음 자리의 오른쪽 조각
    assert.deepEqual(segsOf(1439, ""), [[0, 21439, 20561]]) // 1439 조각은 비우고 오른쪽 하나
    assert.deepEqual(segsOf(3000, "가"), [[0, 0, 3000], [2, 23000, 19000]]) // 왼쪽에 다 드는 글
    assert.deepEqual(segsOf(1440, "가나"), [[0, 21440, 20560]]) // 왼쪽에 안 드는 글은 넓은 쪽
  })
  it("줄이 통째로 여는 괄호류면 끝금칙으로 내리지 않고 들어가는 만큼 채운다", () => {
    const text = "‘".repeat(30), widths = Array(30).fill(100)
    assert.deepEqual(wrap(text, 1000, 1000, 1000, 100, "charAll", { widths, kinsoku: "hancom" }).starts, [0, 10, 20]) // 한 글자씩 나르지 않는다
    assert.deepEqual(wrap("가" + text, 1000, 1000, 1000, 100, "charAll", { widths: [100, ...widths], kinsoku: "hancom" }).starts, [0, 1, 11, 21]) // 앞 글자가 있으면 종전처럼 함께 내린다
  })
  it("글자 단위 줄에서 줄에 안 드는 긴 영문 단어는 다음 줄로 넘긴 뒤 쪼갠다", () => {
    const [p] = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가가 ${"a".repeat(100)}</hp:t></hp:run></hp:p>`)
    assert.equal(p.map(sg => sg[0])[1], 3) // "가가 " 다음 줄부터 URL — 첫 줄 남은 자리에서 쪼개지 않는다
  })
  it("기호 사설 영역 U+F0A0 은 그 글꼴의 빈칸 폭으로 잰다 — 함초롬 0.3em", () => {
    assert.equal(hancomCharWidth("\uf0a0", 1400, 100, -8, "hcr"), 388) // 4·MulDiv(300, 350, 1000) = 420, 자간 4·MulDiv(105, −8, 100) = −32
  })
  it("문단 모양이 한 줄로 입력(lineWrap=SQUEEZE)이면 넘쳐도 줄을 바꾸지 않는다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD" lineWrap="SQUEEZE"/></hh:paraPr></hh:paraProperties>`)
    const [p] = reflowed(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(60)}</hp:t></hp:run></hp:p>`, 42000, head)
    assert.deepEqual(p.map(sg => sg[0]), [0])
  })
  it("글자 단위 줄에서 하이퍼링크 필드 시작 컨트롤은 뒤 URL 과 함께 다음 줄 머리로 간다", () => {
    const [p] = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${"가".repeat(41)} </hp:t><hp:ctrl><hp:fieldBegin type="HYPERLINK"/></hp:ctrl></hp:run><hp:run charPrIDRef="0"><hp:t>abcdef</hp:t></hp:run></hp:p>`)
    assert.deepEqual(p.map(sg => sg[0]), [0, 42]) // 가×41 + 공백 = 42, 컨트롤(8칸)부터 둘째 줄 — 컨트롤 뒤(50)가 아니다
  })
  it("줄 나눔으로 끝난 문단의 마지막 빈 줄은 문단 끝 칸에서 시작한다(textpos 0 아님)", () => {
    const [p] = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다<hp:lineBreak/></hp:t></hp:run></hp:p>`)
    assert.deepEqual(p.map(sg => sg[0]), [0, 4]) // 가나다(3) + 줄 나눔(1)
  })
  it("한양신명조 하이픈은 0.572em (HCI Poppy 는 0.332em) — HFT 영문 폭", () => {
    assert.equal(hancomCharWidth("-", 1000, 100, 0, faceClassForReflow("한양신명조")), 572) // 4·MulDiv(572, 250, 1000)
    assert.equal(hancomCharWidth("-", 1000, 100, 0, faceClassForReflow("HCI Poppy")), 332)
  })
  it("HFT 글꼴의 영문 칸은 HFT 영문 폭표, 표가 없던 HFT 글꼴도 폭표를 얻는다", () => {
    assert.equal(fontAdvanceEm1000("한양신명조", 0x21), 325)
    assert.equal(fontAdvanceEm1000("HCI Tulip", 0x30), 498) // 저장본 추정값 550 이 아니다
    assert.equal(faceClassForReflow("HCI Hollyhock"), "font:HCI Hollyhock")
    assert.equal(fontAdvanceEm1000("한양견명조", 0xac00), 1000)
  })
  it("글꼴 빈칸을 쓰는 글자 모양(useFontSpace=1)은 빈칸을 그 글꼴 빈칸 폭으로 잰다 — KoPub바탕 0.312em", async () => {
    const { glyphWidth } = await import("../src/render/reflow.js")
    const st = { height: 1000, ratio: 95, spacing: 0, face: "KoPub바탕체 Light", bold: false, italic: false, underline: false }
    assert.equal(glyphWidth(" ", { ...st, fontSpace: true }).w, 296) // 4·⌊312·250·95/10⁵⌋
    assert.equal(glyphWidth(" ", st).w, 476) // 반각: 4·MulDiv(125, 95, 100)
    assert.equal(glyphWidth(" ", { ...st, face: "HY엽서M", fontSpace: true }).w, 476) // 빈칸 폭을 모르는 글꼴은 반각
  })
  it("TTF 로 적힌 한양 글꼴은 대체 글꼴(substFont)로 잰다 — HFT 로만 있는 글꼴이다", () => {
    const head = HEAD.replace('<hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="LATIN">', '<hh:font id="0" face="바탕"/><hh:font id="1" face="한양중고딕" type="TTF"><hh:substFont face="HY중고딕" type="TTF"/></hh:font><hh:font id="2" face="한양신명조" type="TTF"><hh:substFont face="한양신명조" type="HFT"/></hh:font><hh:font id="3" face="한양견고딕" type="HFT"><hh:substFont face="HY견고딕" type="TTF"/></hh:font></hh:fontface><hh:fontface lang="LATIN">')
      .replace("</hh:charProperties>", `<hh:charPr id="5" height="1000"><hh:fontRef hangul="1" latin="0"/></hh:charPr><hh:charPr id="6" height="1000"><hh:fontRef hangul="2" latin="0"/></hh:charPr><hh:charPr id="7" height="1000"><hh:fontRef hangul="3" latin="0"/></hh:charPr></hh:charProperties>`)
    const cp = parseRenderStyles(head).charPr
    assert.equal(cp.get("5")?.face, "HY중고딕")
    assert.deepEqual([cp.get("6")?.face, cp.get("6")?.hft], ["한양신명조", true])
    assert.equal(cp.get("7")?.face, "한양견고딕") // HFT 항목은 그대로
  })
  it("TTF 글자 폭은 글꼴 단위 ÷ unitsPerEm 소수 그대로 — 바탕 숫자 13pt 776 (정수 595 로 재면 772)", () => {
    assert.equal(fontAdvanceEm1000("바탕", 0x30), 595.703125) // 610/1024
    assert.equal(hancomCharWidth("0", 1300, 100, 0, faceClassForReflow("바탕")), 776) // 4·MulDiv(610, 325, 1024)
    assert.equal(fontAdvanceEm1000("KoPub바탕체 Medium", 0x4e0a), 936) // 보정은 그 굵기에만
  })
  it("폭표가 없던 글꼴도 보정표로 새 표를 연다 — 시스템 숫자 0.485em, 배달의민족 도현 한글 0.96em", () => {
    assert.equal(faceClassForReflow("시스템"), "font:시스템")
    assert.equal(fontAdvanceEm1000("시스템", 0x30), 485)
    assert.equal(fontAdvanceEm1000("시스템", 0x7e), 500) // 표에 없는 영문은 반각
    assert.equal(fontAdvanceEm1000("배달의민족 도현", 0xac00), 960)
  })
  it("고정폭 빈칸(fwSpace)은 1/4em 이고 줄을 끊지 않는다 (한컴 저장본 칸 \"변경 전\" 한 줄)", () => {
    const q = hancomCharWidth("\u2005", 1000, 100, 0, "cjk")
    assert.equal(q, 248) // 4·⌊1000/16⌋ — 공백(500)의 절반
    assert.equal(hancomCharWidth("\u2005", 1000, 100, -11, "cjk"), 220) // 자간은 공백처럼 받는다: 248 + 4·MulDiv(62, −11, 100) = 248 − 28
    const ga = hancomCharWidth("가", 1000, 100, 0, faceClassForReflow("바탕"))
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가가<hp:fwSpace/>가</hp:t></hp:run></hp:p>`
    assert.equal(reflowed(body, 3 * ga + q + 4)[0].length, 1) // 0.5em 공백이면 넘쳐 두 줄
  })
  it("칸이 내용으로 자라면 행 높이 = 내용 + 칸 위아래 여백, 칸 안 떠 있는 개체는 문단 위 간격 앞에 놓인다", async () => {
    const { measureTableHeight } = await import("../src/render/para-model.js")
    const { DEFAULT_PARA_GEOM } = await import("../src/render/head-styles.js")
    const cell = (inner: string, pp = 0) => `<hp:tbl ${NS} rowCnt="1" colCnt="1"><hp:sz width="10000" height="1000"/><hp:tr><hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="${pp}">${inner}</hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`
    const tbl = (xml: string) => createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
    // 한컴 저장본: 칸 높이 2994·내용 3480 → 표 3762
    assert.equal(measureTableHeight(tbl(cell(`<hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="3480" textheight="3480" baseline="2958" spacing="0" horzpos="0" horzsize="8980"/></hp:linesegarray>`))), 3762)
    // 위 간격 500 문단의 떠 있는 그림 9795 — 그림은 문단 영역 위(0)에서, 행 = 9795 + 282
    const pic = `<hp:run charPrIDRef="0"><hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="5000" height="9795"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="500" vertsize="1400" textheight="1400" baseline="1190" spacing="840" horzpos="0" horzsize="0"/></hp:linesegarray>`
    const memo = () => ({ cell: new WeakMap(), table: new WeakMap(), paraGeom: new Map([["5", { ...DEFAULT_PARA_GEOM, spaceBefore: 500 }]]) })
    assert.equal(measureTableHeight(tbl(cell(pic, 5)), memo()), 10077)
  })
  it("칸 간격(cellSpacing)은 행마다 위에 한 번, 마지막 행 아래에 한 번 더 든다", async () => {
    const { measureTableHeight, measureTableRowHeights } = await import("../src/render/para-model.js")
    const tc = (c: number, r: number, rs: number, h: number) => `<hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"/></hp:p></hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="${rs}"/><hp:cellSz width="5000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
    const tbl = (sp: number) => createXmlParser().parseFromString(`<hp:tbl ${NS} rowCnt="2" colCnt="2" cellSpacing="${sp}"><hp:sz width="10000" height="${2000 + 3 * sp}"/><hp:tr>${tc(0, 0, 1, 1000)}${tc(1, 0, 2, 2000 + sp)}</hp:tr><hp:tr>${tc(0, 1, 1, 1000)}</hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element
    // 두 행 칸은 그 사이 간격을 품는다(2255) — 행이 자라지 않는다. 표 = 행 합 2000 + 255 × 3 (한컴 저장본: 16행 33168 + 255 × 17 = 37503)
    assert.deepEqual(measureTableRowHeights(tbl(255)), [1255, 1510])
    assert.equal(measureTableHeight(tbl(255)), 2765)
    assert.deepEqual(measureTableRowHeights(tbl(0)), [1000, 1000])
  })
  it("마지막 글자의 자간은 넘침 판정에 넣지 않는다", () => {
    const text = "가가가가"
    const widths = [96, 96, 96, 96], spacings = [-4, -4, -4, -4] // 100 에 자간 −4
    assert.deepEqual(wrap(text, 384, 384, 1000, 100, "charAll", { widths, spacings, kinsoku: "hancom" }).starts, [0, 3]) // 288 + 100(자간 전) > 384
    assert.deepEqual(wrap(text, 384, 384, 1000, 100, "charAll", { widths, kinsoku: "hancom" }).starts, [0]) // 자간 몫을 안 주면 384 에 든다
  })
})

describe("보충 사용자 영역 기호 폭", () => {
  it("한컴 기호는 반각 0.5em, 글머리 동그라미 숫자(U+F02B1~F02B6)·U+F02FB 는 전각 1em", async () => {
    const { measureTextWidth } = await import("../src/hwpx/text-metrics.js")
    assert.equal(measureTextWidth(String.fromCodePoint(0xf080f), 1000, 100, { faceClass: "hcr" }), 500)
    assert.equal(measureTextWidth(String.fromCodePoint(0xf02fc), 1000, 100, { faceClass: "hcr" }), 500)
    for (const cp of [0xf02b1, 0xf02b5, 0xf02fb]) assert.equal(measureTextWidth(String.fromCodePoint(cp), 1000, 100, { faceClass: "hcr" }), 1000, cp.toString(16))
  })
  it("U+F0000~F02FB·U+F035F~F03F4 는 글꼴과 상관없이 전각(글머리 가운데점 U+F02EF 등), 그 사이·뒤는 반각", async () => {
    const { measureTextWidth } = await import("../src/hwpx/text-metrics.js")
    for (const fc of ["hcr", "font:맑은 고딕"] as const)
      for (const cp of [0xf00e1, 0xf012b, 0xf02ef, 0xf035f, 0xf03c5, 0xf03f4]) assert.equal(measureTextWidth(String.fromCodePoint(cp), 1000, 100, { faceClass: fc }), 1000, `${fc} ${cp.toString(16)}`)
    for (const cp of [0xf035e, 0xf03f5, 0xf0400]) assert.equal(measureTextWidth(String.fromCodePoint(cp), 1000, 100, { faceClass: "hcr" }), 500, cp.toString(16))
  })
})

describe("딩뱃 원문자 대체 폭", () => {
  it("❶~➓ 는 함초롬 글꼴엔 제 폭(970), 그 밖의 글꼴엔 한컴바탕 대체 폭 1em", async () => {
    const { measureTextWidth, faceClassOf } = await import("../src/hwpx/text-metrics.js")
    assert.equal(measureTextWidth("➌", 1000, 100, { faceClass: faceClassOf("한컴 윤고딕 230") }), 1000)
    assert.equal(measureTextWidth("❶", 1000, 100, { faceClass: faceClassOf("HY헤드라인M") }), 1000)
    assert.equal(measureTextWidth("➌", 1000, 100, { faceClass: faceClassOf("함초롬돋움") }), 970)
  })
})

describe("글꼴에 없는 기호의 한컴바탕 대체 폭", () => {
  it("– ⇨ ∘ ‣ 〇 는 그 글자를 따로 갖지 않은 글꼴에서 한컴바탕 폭", async () => {
    const { measureTextWidth, faceClassOf } = await import("../src/hwpx/text-metrics.js")
    const fc = faceClassOf("HY헤드라인M")
    assert.deepEqual(["–", "⇨", "∘", "‣", "〇"].map(c => measureTextWidth(c, 1000, 100, { faceClass: fc })), [430, 1000, 500, 465, 1000])
    // 그 글자를 가진 글꼴(맑은 고딕 – 1051/2048)은 제 폭
    assert.equal(measureTextWidth("–", 1000, 100, { faceClass: faceClassOf("맑은 고딕") }), 513.18359375)
  })
})

describe("reflow: 글꼴 줄 높이", () => {
  it("글꼴에 어울리는 줄 높이는 반올림한 ascent + 버린 descent — 맑은 고딕 11pt 1464, 12pt 1598", () => {
    const head = HEAD.replace(`<hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="LATIN">`, `<hh:font id="0" face="바탕"/><hh:font id="1" face="맑은 고딕"/></hh:fontface><hh:fontface lang="LATIN">`)
      .replace("</hh:charProperties>", `<hh:charPr id="8" height="1100"><hh:fontRef hangul="1" latin="0"/></hh:charPr><hh:charPr id="9" height="1200"><hh:fontRef hangul="1" latin="0"/></hh:charPr></hh:charProperties>`)
      .replace("</hh:paraProperties>", `<hh:paraPr id="8" fontLineHeight="1"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties>`)
    const vs = (cpr: number) => {
      const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="8"><hp:run charPrIDRef="${cpr}"><hp:t>가나</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
      const sg = root.getElementsByTagName("hp:lineseg")[0]
      return [sg.getAttribute("vertsize"), sg.getAttribute("baseline")]
    }
    assert.deepEqual([vs(8), vs(9)], [["1464", "1198"], ["1598", "1307"]])
  })
})

describe("reflow: 어울림 개체가 덮은 줄", () => {
  it("앞 문단의 어울림 그림이 줄 자리를 다 덮으면 다음 문단은 그림 아래에서 시작한다", () => {
    const pic = `<hp:pic id="1" textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="43000" height="20000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
    const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다라</hp:t></hp:run></hp:p></hs:sec>`
    const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const segs = Array.from(Array.from(root.getElementsByTagName("hp:p"))[1].getElementsByTagName("hp:lineseg"))
    assert.deepEqual(segs.map(sg => [sg.getAttribute("vertpos"), sg.getAttribute("horzsize")]), [["20000", "42000"]]) // 그림 바닥에서 본문 폭 한 줄
  })
})

describe("reflow: 필드 끝", () => {
  it("줄보다 넓은 개체 바로 뒤 필드 끝은 어절 단위 문단에서도 그 줄에 붙는다", () => {
    // 누름틀 시작(폭 0) + 줄보다 넓은 표 + 누름틀 끝 — 표와 필드 끝이 한 낱말로 묶여 쪼개질 때도 필드 끝은 다음 줄로 가지 않는다
    for (const mode of ["keep", "charAll"] as const)
      assert.deepEqual(wrap("\u2060\ufffc\ufdd0", 49608, 49608, 1100, 100, mode, { widths: [0, 50175, 0], kinsoku: "hancom" }).starts, [0, 1])
  })
  it("필드 끝 바로 뒤 줄보다 넓은 개체는 필드 끝을 앞 줄에 두고 넘어간다", () => {
    // 누름틀 시작 + " " + 누름틀 끝 + 넓은 표: 어절 단위에서 필드 끝과 표가 한 낱말이어도 필드 끝은 첫 줄 끝
    assert.deepEqual(wrap("\u2060 \ufdd0\ufffc", 48188, 48188, 1500, 100, "keep", { widths: [0, 500, 0, 47904], kinsoku: "hancom" }).starts, [0, 3])
  })
})

describe("reflow: 전각 빈칸", () => {
  it("줄 끝에서 넘치는 전각 빈칸(U+3000)은 공백처럼 그 줄에 건다", () => {
    const text = "100.0\u3000", widths = [552, 552, 552, 268, 552, 1100]
    assert.deepEqual(wrap(text, 3512, 3512, 1100, 100, "keep", { widths, kinsoku: "hancom" }).starts, [0]) // 어절 단위(한 단어)
    assert.deepEqual(wrap("가나\u3000", 2000, 2000, 1000, 100, "charAll", { widths: [1000, 1000, 1000], kinsoku: "hancom" }).starts, [0]) // 글자 단위
  })
})

describe("reflow: 오른쪽 탭", () => {
  it("오른쪽 탭 뒤 글이 줄 끝에 꼭 맞으면 마지막 글자 자간이 음수여도 한 줄", () => {
    const text = "가나\t 2", widths = [1000, 1000, 7000, 480, 520], spacings = [0, 0, 0, -20, -20]
    assert.deepEqual(wrap(text, 10000, 10000, 1000, 100, "charAll", { widths, spacings, kinsoku: "hancom" }).starts, [0, 4]) // 탭이 오른쪽이 아니면 넘친다
    assert.deepEqual(wrap(text, 10000, 10000, 1000, 100, "charAll", { widths, spacings, kinsoku: "hancom", rightTabs: new Set([2]) }).starts, [0])
  })
  it("오른쪽 탭의 저장 폭으로 탭 뒤 글이 줄 끝을 넘으면 줄 끝에서 끝나게 줄인다", () => {
    const [p] = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다<hp:tab width="39500" leader="3" type="2"/>12</hp:t></hp:run></hp:p>`)
    assert.deepEqual(p.map(s => s[0]), [0]) // 3000 + 39500 + 숫자 둘 > 42000 이지만 한 줄
  })
})

describe("reflow: 양식 컨트롤", () => {
  it("글자처럼 취급하는 체크 상자는 그 높이로 줄을 차지한다(기준선 85%)", () => {
    const cb = `<hp:checkBtn caption="" value="UNCHECKED"><hp:sz width="1295" height="1984"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:checkBtn>`
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${cb}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(HEAD), { BODY_W: 42000, BODY_H: 80000 })
    const sg = root.getElementsByTagName("hp:lineseg")[0]
    assert.deepEqual([sg.getAttribute("vertsize"), sg.getAttribute("baseline")], ["1984", "1686"])
  })
})

describe("reflow: 고정 줄 간격 0", () => {
  it("줄 간격 고정값 0 이면 줄 간격 몫이 −줄 높이(줄이 겹친다)", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="9"><hh:align horizontal="LEFT"/><hh:lineSpacing type="FIXED" value="0"/></hh:paraPr></hh:paraProperties>`)
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="9"><hp:run charPrIDRef="0"><hp:t>가나</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
    assert.equal(root.getElementsByTagName("hp:lineseg")[0].getAttribute("spacing"), "-1000")
  })
})

describe("reflow: 세로 정렬 위", () => {
  it("문단 세로 정렬이 위(TOP)면 줄 기준선은 0 이다", () => {
    const head = HEAD.replace("</hh:paraProperties>", `<hh:paraPr id="7"><hh:align horizontal="LEFT" vertical="TOP"/></hh:paraPr></hh:paraProperties>`)
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="7"><hp:run charPrIDRef="0"><hp:t>가나</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
    assert.equal(root.getElementsByTagName("hp:lineseg")[0].getAttribute("baseline"), "0")
  })
})

describe("reflow: 필드 끝", () => {
  it("필드 끝 컨트롤은 줄보다 넓은 표가 넘친 줄에도 붙는다(떠 있는 개체 앵커는 다음 줄)", () => {
    const tbl = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="50000" height="2000"/><hp:pos treatAsChar="1"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run></hp:p></hp:subList><hp:cellSz width="50000" height="2000"/></hp:tc></hp:tr></hp:tbl>`
    const fb = `<hp:ctrl><hp:fieldBegin type="CLICK_HERE"/></hp:ctrl>`, fe = `<hp:ctrl><hp:fieldEnd/></hp:ctrl>`
    const [p] = reflowed(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${fb}${tbl}${fe}<hp:t/></hp:run></hp:p>`)
    assert.deepEqual(p.map(s => s[0]), [0, 8]) // 누름틀 시작 | 표 + 누름틀 끝
  })
})

describe("reflow: 언어 칸", () => {
  it("기호·한자·일어 글자는 그 언어 칸(fontRef)의 글꼴·장평으로 잰다", () => {
    const head = HEAD.replace(`<hh:fontface lang="LATIN"><hh:font id="0" face="바탕"/></hh:fontface>`,
      `<hh:fontface lang="LATIN"><hh:font id="0" face="바탕"/></hh:fontface><hh:fontface lang="SYMBOL"><hh:font id="0" face="바탕"/><hh:font id="1" face="굴림"/></hh:fontface>`)
      .replace("</hh:charProperties>", `<hh:charPr id="5" height="1000"><hh:fontRef hangul="0" latin="0" symbol="1"/><hh:ratio hangul="100" latin="100" hanja="80" japanese="90" symbol="100"/></hh:charPr></hh:charProperties>`)
    const st = parseRenderStyles(head).charPr.get("5")!
    assert.equal(st.symbol?.face, "굴림")
    assert.deepEqual(["◦", "가", "漢", "あ", "a"].map(c => glyphWidth(c, st).w), [376, 1000, 800, 900, 540]) // ◦ 굴림 0.375em · 한자 장평 80 · 일어 90
  })
})

describe("reflow: 영문 분류 글자 단어", () => {
  it("글자 단위 줄에서도 영문 분류 글자(‘’“”·, U+00A1~024F)는 ASCII 처럼 이어 한 단어가 된다", () => {
    const text = "가".repeat(5) + "it’s" + "가".repeat(5), widths = Array(text.length).fill(100)
    assert.deepEqual(wrap(text, 700, 700, 1000, 100, "charAll", { widths, kinsoku: "hancom" }).starts, [0, 5, 12]) // "it’s" 를 쪼개지 않고 다음 줄로
    const dots = "·".repeat(30), dw = Array(30).fill(100)
    assert.deepEqual(wrap(dots, 1000, 1000, 1000, 100, "charAll", { widths: dw, kinsoku: "hancom", before2024: true }).starts, [0, 10, 20]) // 긴 단어로 쪼개 금칙 없이
  })
})

describe("reflow: 주석 머리 번호", () => {
  it("주석 머리 번호에는 자간을 매기지 않는다", () => {
    const head = HEAD.replace("</hh:charProperties>", `<hh:charPr id="3" height="1000"><hh:fontRef hangul="0" latin="0"/><hh:spacing hangul="-50" latin="-50" hanja="-50" japanese="-50" other="-50" symbol="-50" user="-50"/></hh:charPr></hh:charProperties>`)
    // 단 폭 20000 = 번호 "1)"(자간 없이 872, 자간 −50% 면 436) + "가" 38자(자간 −50% 로 500씩, 마지막 글자 자간은 넘침 판정에서 뺀다)
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr colCount="1"/></hp:ctrl><hp:ctrl><hp:endNote><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="3"><hp:ctrl><hp:autoNum num="1" numType="ENDNOTE"><hp:autoNumFormat type="DIGIT" suffixChar=")"/></hp:autoNum></hp:ctrl><hp:t>${"가".repeat(38)}</hp:t></hp:run></hp:p></hp:subList></hp:endNote></hp:ctrl><hp:t>본문</hp:t></hp:run></hp:p>`
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 20000, BODY_H: 80000 })
    assert.equal(root.getElementsByTagName("hp:endNote")[0].getElementsByTagName("hp:lineseg").length, 2) // 872 + 19000 + 500 > 20000
  })
})

describe("reflow: 한글 2024 이전 판 저장 문서", () => {
  const head = HEAD.replace(`<hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/>`, `<hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/><hh:font id="1" face="고딕" type="HFT"/>`)
    .replace(`<hh:fontface lang="LATIN"><hh:font id="0" face="바탕"/>`, `<hh:fontface lang="LATIN"><hh:font id="0" face="바탕"/><hh:font id="1" face="고딕" type="HFT"/>`)
    .replace("</hh:charProperties>", `<hh:charPr id="2" height="1000"><hh:fontRef hangul="1" latin="1"/><hh:bold/></hh:charPr></hh:charProperties>`)
  it("저장 판은 version.xml appVersion 첫 수 — 13 미만이면 2024 이전 판", () => {
    assert.equal(hwpxAppMajor(`<hv:HCFVersion appVersion="12, 0, 0, 535 WIN32LEWindows_10"/>`), 12)
    assert.equal(hwpxAppMajor(null), undefined)
    assert.equal(parseRenderStyles(head, { appMajor: 12 }).before2024, true)
    assert.equal(parseRenderStyles(head, { appMajor: 13 }).before2024, undefined)
    assert.equal(parseRenderStyles(head).before2024, undefined) // 판을 모르면 2024 규칙
  })
  it("주석 머리 번호의 진하게는 2024 이전 판만 폭에 넣는다", () => {
    // 단 폭 20000 = 번호 "1)"(고딕 반각 500 × 2) + 바탕 "가" 19자 — 진하게(+50씩)를 넣으면 넘친다
    const body = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:ctrl><hp:colPr colCount="1"/></hp:ctrl><hp:ctrl><hp:endNote><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="2"><hp:ctrl><hp:autoNum num="1" numType="ENDNOTE"><hp:autoNumFormat type="DIGIT" suffixChar=")"/></hp:autoNum></hp:ctrl></hp:run><hp:run charPrIDRef="0"><hp:t>${"가".repeat(19)}</hp:t></hp:run></hp:p></hp:subList></hp:endNote></hp:ctrl><hp:t>본문</hp:t></hp:run></hp:p>`
    const lines = (appMajor?: number) => {
      const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${body}</hs:sec>`, "text/xml").documentElement as unknown as Element
      reflowSection(root, parseRenderStyles(head, { appMajor }), { BODY_W: 20000, BODY_H: 80000 })
      const p = root.getElementsByTagName("hp:endNote")[0].getElementsByTagName("hp:p")[0]
      return p.getElementsByTagName("hp:lineseg").length
    }
    assert.deepEqual([lines(), lines(13), lines(12)], [1, 1, 2])
  })
  it("2024 이전 판은 내린 글자도 줄머리 금지면 한 글자 더 내리고, 영문 단어 안 쪼개기엔 금칙이 없다", () => {
    const text = "가".repeat(9) + "…」가", widths = Array(12).fill(100)
    assert.deepEqual(wrap(text, 1000, 1000, 1000, 100, "charAll", { widths, kinsoku: "hancom" }).starts, [0, 9]) // "…」" 를 함께 내린다
    assert.deepEqual(wrap(text, 1000, 1000, 1000, 100, "charAll", { widths, kinsoku: "hancom", before2024: true }).starts, [0, 8]) // "가…」"
    const cell = "(92.5%)", cw = Array(7).fill(100)
    assert.deepEqual(wrap(cell, 600, 600, 1000, 100, "charAll", { widths: cw, kinsoku: "hancom", before2024: true }).starts, [0, 6]) // ")" 가 줄머리
    assert.deepEqual(wrap("(94.6%)", 500, 500, 1000, 100, "charAll", { widths: cw, kinsoku: "hancom" }).starts, [0, 5]) // 2024 도 쪼갤 땐 "%" 가 줄머리
    const word = "인구(명)", ww = [900, 900, 452, 900, 452]
    assert.deepEqual(wrap(word, 2452, 2452, 900, 100, "keep", { widths: ww, kinsoku: "hancom", before2024: true }).starts, [0, 3]) // 어절 단위 칸: "인구(" | "명)"
    assert.deepEqual(wrap(word, 2452, 2452, 900, 100, "keep", { widths: ww, kinsoku: "hancom" }).starts, [0, 2]) // 2024 는 "(" 를 함께 내린다
    const t3 = "가".repeat(8) + "(8.12)", w3 = Array(14).fill(100)
    // 영문도 글자로 끊는 문단의 단위 경계("(" | "8")는 쪼개기가 아니다 — 줄 끝 "(" 를 함께 내린다
    assert.deepEqual(wrap(t3, 1000, 1000, 1000, 100, "charAll", { widths: w3, kinsoku: "hancom", before2024: true, latinBreak: true }).starts, [0, 8])
  })
  it("2024 이전 판의 휴먼명조 ‘’ 는 전각, 기호 일부도 폭이 다르다", () => {
    const st = (before2024?: boolean) => ({ ...parseRenderStyles(HEAD).charPr.get("0")!, face: "휴먼명조", height: 1000, latin: undefined, ...(before2024 ? { before2024 } : {}) })
    assert.deepEqual(["‘", "’"].map(c => glyphWidth(c, st()).w), [220, 592])
    assert.deepEqual(["‘", "’"].map(c => glyphWidth(c, st(true)).w), [1000, 1000])
    assert.deepEqual(["□", "…", "•"].map(c => glyphWidth(c, st(true)).w), [1000, 864, 464]) // 2024 이전 판 기호 폭
    const bt = (before2024?: boolean) => ({ ...st(before2024), face: "Batang" })
    assert.deepEqual(["e", "s"].map(c => glyphWidth(c, bt(true)).w), ["e", "s"].map(c => glyphWidth(c, { ...st(true), face: "바탕" }).w)) // Batang = 바탕
    assert.notDeepEqual(["e", "s"].map(c => glyphWidth(c, bt()).w), ["e", "s"].map(c => glyphWidth(c, { ...st(), face: "바탕" }).w)) // 2024 는 따로
    assert.deepEqual(["e", "s", "1", "é"].map(c => glyphWidth(c, bt()).w), ["e", "s", "1", "é"].map(c => glyphWidth(c, { ...st(), face: "한컴바탕" }).w)) // 2024 는 한컴바탕
    assert.notDeepEqual(["□", "…", "•"].map(c => glyphWidth(c, st()).w), [1000, 864, 464])
  })
})
