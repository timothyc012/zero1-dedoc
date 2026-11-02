/**
 * generate --template 회귀 — 보안(신뢰할 수 없는 견본 zip·XML)·복제 정확성·담당 줄·합계 행·참고 쪽 항목.
 * 견본은 kordoc 이 만든 합성 문서(서울방침)를 고쳐 쓴 것 — 실제 부서 문서는 저장소에 두지 않는다.
 */

import { describe, it, before } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { markdownToHwpx } from "../src/index.js"
import { validateHwpx } from "../src/validate.js"
import { scanTemplate, matchContactPieces, replaceCellValue } from "../src/hwpx/gen-from-template.js"
import { elementAt, fillParagraph } from "../src/hwpx/template-scan.js"
import { findElementEnd } from "../src/roundtrip/source-map.js"

const TEMPLATE_MD = `# 견본 사업 추진계획

일자리정책과장 : 김견본 ☎1111 담당 : 이견본 ☎2222

> 견본 사업을 체계적으로 추진하기 위한 계획을 수립하고자 함

## 추진배경

□ 견본 현황

ㅇ 견본 제도 시행에 따른 후속 조치 필요

- 견본 지침 개정

※ 견본 참고 문구

| 구분 | 견본내용 | 비고 |
| --- | --- | --- |
| 가 | 견본 하나 | 1 |
| 나 | 견본 둘 | 2 |
| 다 | 견본 셋 | 3 |

| 참고1 | 견본 참고 자료 |

ㅇ 견본 참고 항목
`

const entry = async (buf: ArrayBuffer | Uint8Array, name: string) => (await JSZip.loadAsync(buf)).file(name)!.async("text")
function paraOf(sec: string, text: string): { paraPr: string; charPr: string } {
  const i = sec.indexOf(text)
  assert.ok(i >= 0, `본문에 "${text}" 없음`)
  const pOpen = sec.lastIndexOf("<hp:p ", i)
  const run = sec.lastIndexOf("<hp:run ", i)
  return { paraPr: /paraPrIDRef="(\d+)"/.exec(sec.slice(pOpen))![1], charPr: /charPrIDRef="(\d+)"/.exec(sec.slice(run))![1] }
}

describe("generate --template 회귀", () => {
  let tpl: ArrayBuffer, tplSec: string, tplHead: string
  /** 견본 zip 의 파일을 고쳐 다시 묶는다 */
  const mutate = async (edit: (files: { sec: string }) => string, extra?: (z: JSZip) => void): Promise<Uint8Array> => {
    const z = await JSZip.loadAsync(tpl)
    z.file("Contents/section0.xml", edit({ sec: tplSec }))
    extra?.(z)
    return z.generateAsync({ type: "uint8array" })
  }

  before(async () => {
    tpl = await markdownToHwpx(TEMPLATE_MD, { gongmun: { preset: "서울방침" } })
    tplSec = await entry(tpl, "Contents/section0.xml")
    tplHead = await entry(tpl, "Contents/header.xml")
  })

  // ─── 보안 ───
  it("H1 요소 이름이 정규식 문법이어도 지수 역추적·문법 오류 없이 -1/null", () => {
    const t0 = Date.now()
    assert.equal(findElementEnd(`<(a|a)+b/>${"a".repeat(40)}`, 0), -1)
    assert.equal(findElementEnd("<a[ x>", 0), -1)
    assert.equal(elementAt(`<(a|a)+b x="1">${"a".repeat(40)}`, 0), null)
    const ok = "<hp:p x=\"1\"><hp:p/></hp:p>"
    assert.equal(findElementEnd(ok, 0), ok.length)
    assert.ok(Date.now() - t0 < 500)
  })

  it("H1·M3 깨진 section0(닫히지 않은 linesegarray 수천 개)는 DOM 사전 검사로 바로 거절", async () => {
    const bad = await mutate(({ sec }) => sec.replace("</hs:sec>", "<hp:linesegarray>".repeat(5000) + "</hs:sec>"))
    const t0 = Date.now()
    await assert.rejects(markdownToHwpx("# x", { template: bad }), /XML/)
    assert.ok(Date.now() - t0 < 3000)
  })

  it("H2 상위 경로 엔트리·엔트리 수 초과·암호 견본 거절", async () => {
    await assert.rejects(markdownToHwpx("# x", { template: await mutate(({ sec }) => sec, (z) => z.file("../evil.txt", "x")) }), /경로/)
    await assert.rejects(markdownToHwpx("# x", { template: await mutate(({ sec }) => sec, (z) => { for (let i = 0; i < 501; i++) z.file(`BinData/x${i}.txt`, "x") }) }), /엔트리 수/)
    const enc = await mutate(({ sec }) => sec, (z) => z.file("META-INF/manifest.xml", `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><odf:file-entry odf:full-path="Contents/section0.xml"><odf:encryption-data/></odf:file-entry></odf:manifest>`))
    await assert.rejects(markdownToHwpx("# x", { template: enc }), /암호/)
  })

  it("L7 문자 참조 범위 밖(&#4294967295;)도 예외 없이", () => {
    const out = fillParagraph(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="2"><hp:t>&#4294967295;ㅇ 가</hp:t></hp:run></hp:p>`, "새 글", { marker: true })
    assert.match(out, /새 글/)
  })

  it("M5 큰 표(300행)도 금방", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => `| ${i} | 내용 ${i} | 비고 |`).join("\n")
    const t0 = Date.now()
    const buf = await markdownToHwpx(`# 표\n\n| 번호 | 내용 | 비고 |\n| --- | --- | --- |\n${rows}\n`, { template: tpl })
    assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0}ms`)
    assert.ok((await validateHwpx(buf)).ok)
  })

  it("M6 너무 큰 원형 문단은 쓰지 않고 다음 같은 부호 문단을 원형으로", () => {
    const sec = tplSec.replace("견본 제도 시행에 따른 후속 조치 필요", "가".repeat(70000))
    const scan = scanTemplate(sec, tplHead)
    assert.ok(scan.protos.get("L1")?.includes("견본 참고 항목"))
  })

  // ─── 정확성 ───
  it("C1 원형 문단의 누름틀·책갈피·각주는 복제하지 않는다 (짝 깨짐·id 중복 방지)", async () => {
    const field = `<hp:ctrl><hp:fieldBegin id="77" type="CLICK_HERE" name="" editable="1" dirty="0" zorder="-1" fieldid="1"/></hp:ctrl>`
    const end = `<hp:ctrl><hp:fieldEnd beginIDRef="77" fieldid="1"/></hp:ctrl><hp:ctrl><hp:bookmark name="bm"/></hp:ctrl>`
    const note = `<hp:ctrl><hp:footNote number="1" instId="555"><hp:subList id=""><hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>각주</hp:t></hp:run></hp:p></hp:subList></hp:footNote></hp:ctrl>`
    const t = await mutate(({ sec }) => sec.replace("<hp:t>견본 제도 시행에 따른 후속 조치 필요</hp:t>", `${field}<hp:t>견본 제도 시행에 따른 후속 조치 필요</hp:t>${end}${note}`))
    const out = await entry(await markdownToHwpx("# 새\n\n□ 가\n\nㅇ 하나\n\nㅇ 둘\n", { template: t }), "Contents/section0.xml")
    // (구역 정의의 각주 모양 footNotePr 은 남는다 — 개체만 본다)
    assert.doesNotMatch(out, /<hp:(?:fieldBegin|fieldEnd|bookmark|footNote)\b/)
  })

  it("C2 표가 든 문단은 본문 원형이 아니다", () => {
    const tbl = /<hp:tbl\b[^>]*rowCnt="1" colCnt="2"[\s\S]*?<\/hp:tbl>/.exec(tplSec)![0]
    const sec = tplSec.replace("</hs:sec>", `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>본문 표 문단</hp:t>${tbl}</hp:run></hp:p><hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>본문 평문</hp:t></hp:run></hp:p></hs:sec>`)
    const body = scanTemplate(sec, tplHead).protos.get("body")
    assert.ok(body?.includes("본문 평문") && !body.includes("<hp:tbl"), body?.slice(0, 200))
  })

  it("C3 제목 밑 '- 부제 -' 는 줄표 항목이 아니라 부제 — 요약 상자·담당 줄 판정이 그대로", () => {
    const tops = tplSec.indexOf("</hp:p>", tplSec.indexOf("</hp:tbl>")) + "</hp:p>".length
    const sec = tplSec.slice(0, tops) + `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>- 견본 부제 -</hp:t></hp:run></hp:p>` + tplSec.slice(tops)
    const scan = scanTemplate(sec, tplHead)
    assert.ok(scan.protos.get("subtitle")?.includes("견본 부제"))
    assert.ok(scan.protos.has("summary"), "요약 상자 유지")
    assert.ok(!scan.protos.get("L2")?.includes("부제"))
  })

  it("C4 복제한 데이터 표에서 견본 캡션·칸 영역(cellzoneList)은 뺀다", async () => {
    const t = await mutate(({ sec }) => {
      const at = sec.indexOf("<hp:inMargin", sec.indexOf('rowCnt="4" colCnt="3"'))
      const close = sec.indexOf("/>", at) + 2
      return sec.slice(0, close) + `<hp:caption side="TOP" fullSz="0" width="8504" gap="850" lastWidth="0"><hp:subList id=""><hp:p paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>견본 캡션</hp:t></hp:run></hp:p></hp:subList></hp:caption><hp:cellzoneList><hp:cellzone startRowAddr="0" startColAddr="0" endRowAddr="3" endColAddr="2" borderFillIDRef="1"/></hp:cellzoneList>` + sec.slice(close)
    })
    const out = await entry(await markdownToHwpx("# 새\n\n| 가 | 나 |\n| --- | --- |\n| 1 | 2 |\n", { template: t }), "Contents/section0.xml")
    assert.doesNotMatch(out, /견본 캡션|cellzone/)
  })

  // ─── 원고 해석·경고 ───
  it("W 제목 밑 '□ 날짜…'·'날짜로 시작하는 본문'은 담당 줄로 빼지 않는다", async () => {
    for (const line of ["□ 2026. 1. 1.부터 시행", "2026. 1. 1.부터 시행한다"]) {
      const out = await entry(await markdownToHwpx(`# 제목\n\n${line}\n`, { template: tpl }), "Contents/section0.xml")
      const titleTbl = /<hp:tbl\b[\s\S]*?<\/hp:tbl>/.exec(out)![0]
      assert.ok(!titleTbl.includes("2026. 1."), line)
      assert.ok(out.includes("부터 시행"), line)
    }
  })

  it("W 깊은 항목·Ⅻ 넘는 장·글 안 그림·theme 은 경고", async () => {
    const w: string[] = []
    const md = "# 제목\n\n- a\n  - b\n    - c\n      - d\n        - e\n\n글 ![그림](x.png) 끝\n\n"
      + Array.from({ length: 13 }, (_, i) => `## 장${i + 1}\n\n□ 항목\n`).join("\n")
    await markdownToHwpx(md, { template: tpl, warnings: w, theme: { fontFamily: "굴림" } as never })
    const all = w.join("\n")
    assert.match(all, /4단계/)
    assert.match(all, /Ⅻ/)
    assert.match(all, /alt/)
    assert.match(all, /theme/)
  })

  it("W HTML 표 colspan 이 위 행 rowspan 자리와 겹치면 줄인다 — 칸 좌표 겹침 없음", async () => {
    const html = `<table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td>x</td><td rowspan="2">y</td><td>z</td></tr><tr><td colspan="2">w</td><td>v</td></tr></table>`
    const buf = await markdownToHwpx(`# 표\n\n${html}\n`, { template: tpl })
    const out = await entry(buf, "Contents/section0.xml")
    const tbl = /<hp:tbl\b[^>]*rowCnt="3" colCnt="3"[\s\S]*?<\/hp:tbl>/.exec(out)?.[0]
    assert.ok(tbl, "3×3 표")
    const addrs = [...tbl!.matchAll(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/g)].map((m) => `${m[2]},${m[1]}`)
    assert.equal(new Set(addrs).size, addrs.length)
    assert.ok((await validateHwpx(buf)).ok)
  })

  it("W XML 비문자(U+FFFE)·짝 없는 대리 문자는 빼고 쓴다", async () => {
    const buf = await markdownToHwpx("# 제목\n\n□ 가￾나\uD800다\n", { template: tpl })
    const out = await entry(buf, "Contents/section0.xml")
    assert.ok(out.includes("가나다"))
    assert.ok((await validateHwpx(buf)).ok)
  })

  it("W CLI — 루트 --plain 이나 잘못된 --total-row 를 --template 과 주면 exit 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "kordoc-tpl-"))
    try {
      const md = join(dir, "a.md"), t = join(dir, "t.hwpx")
      writeFileSync(md, "# 제목\n")
      writeFileSync(t, Buffer.from(tpl))
      const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
      const plain = spawnSync(process.execPath, ["--import", "tsx", CLI, "--plain", "generate", md, "--template", t, "-o", join(dir, "o.hwpx")], { encoding: "utf-8", timeout: 60000 })
      assert.equal(plain.status, 1, plain.stderr)
      assert.match(plain.stderr, /--plain/)
      const tr = spawnSync(process.execPath, ["--import", "tsx", CLI, "generate", md, "--template", t, "--total-row", "middle", "-o", join(dir, "o.hwpx")], { encoding: "utf-8", timeout: 60000 })
      assert.equal(tr.status, 1, tr.stderr)
      assert.match(tr.stderr, /--total-row/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ─── 실제 견본 시험에서 나온 것 ───
  it("R1 결재선 칸(날짜|과장|팀장|담당)은 직위 낱말로 맞춰 견본 꼴로 — 부서 이름은 담당 칸에 넣지 않고, 원고에 없는 직위 칸은 견본 그대로", () => {
    // 사용자 지적(2026-10-21 "제목표 소속 쓰는 것부터 엉망"): 담당 칸에 "스마트정보과 담당: …" 를 통째로 넣어 넘치고 과장·팀장 칸이 비었다
    const slots = ["2026. 10. 19.(월)", "스마트정보과장 : 한중식 ☎7210", "AI전략팀장 :추윤정 ☎7211", "담당 : 류승인 ☎7215"]
    assert.deepEqual(matchContactPieces(slots, "2026. 10. 21.(수) 스마트정보과 담당: 홍길동 ☎7215"),
      ["2026. 10. 21.(수)", "스마트정보과장 : 한중식 ☎7210", "AI전략팀장 :추윤정 ☎7211", "담당 : 홍길동 ☎7215"])
    assert.deepEqual(matchContactPieces(slots, "2026. 10. 21.(수) | 담당 : 김 ☎1 | 과장 : 이 ☎2"),
      ["2026. 10. 21.(수)", "과장 : 이 ☎2", "AI전략팀장 :추윤정 ☎7211", "담당 : 김 ☎1"])
    assert.deepEqual(matchContactPieces(slots, "2026. 10. 21.(수) 스마트정보과장: 김과장 ☎7200 | 담당: 홍길동 ☎7215"),
      ["2026. 10. 21.(수)", "스마트정보과장 : 김과장 ☎7200", "AI전략팀장 :추윤정 ☎7211", "담당 : 홍길동 ☎7215"])
    assert.deepEqual(matchContactPieces(slots, null), ["", "", "", ""], "원고에 담당 줄이 없으면 견본 사람 정보를 남기지 않는다")
  })

  it("R1 결재선 칸 값만 바꿀 때 견본의 고정폭 빈칸·run 글자 모양은 그대로 (한 줄에 들어가게)", () => {
    // 글로 다시 짜면 고정폭 빈칸이 다른 폭의 빈칸이 되어 넘쳤다(실제 부서 서식, 2026-10-21)
    const p = `<hp:p paraPrIDRef="7" styleIDRef="0"><hp:run charPrIDRef="9"><hp:t>스마트정보과장<hp:fwSpace/>:<hp:fwSpace/>한중식 ☎7210</hp:t></hp:run></hp:p>`
    assert.equal(replaceCellValue(p, "한중식 ☎7210", "김과장 ☎7200"),
      `<hp:p paraPrIDRef="7" styleIDRef="0"><hp:run charPrIDRef="9"><hp:t>스마트정보과장<hp:fwSpace/>:<hp:fwSpace/>김과장 ☎7200</hp:t></hp:run></hp:p>`)
    assert.equal(replaceCellValue(p, "없는 값", "x"), null, "옛 값이 없으면 글로 다시 짠다")
    assert.equal(replaceCellValue(`<hp:p a="7210"><hp:t>7210</hp:t></hp:p>`, "7210", "1"), null, "두 번 나오면 손대지 않는다")
  })

  it("R1 균등 분할(DISTRIBUTE) 담당 칸은 가운데 정렬 문단 모양으로 — 짧은 글이 흩어지지 않게", async () => {
    const buf = await markdownToHwpx("# 새 문서\n\n담당 : 김담당 ☎5678\n", { template: tpl })
    const out = await entry(buf, "Contents/section0.xml"), head = await entry(buf, "Contents/header.xml")
    const id = paraOf(out, "김담당").paraPr
    const def = new RegExp(`<hh:paraPr\\b[^>]*\\bid="${id}"[\\s\\S]*?</hh:paraPr>`).exec(head)![0]
    assert.doesNotMatch(def, /DISTRIBUTE/)
  })

  it("R3 참고 띠 아래 부호 없는 첫 단계 항목은 견본 참고 쪽 항목 서식(□ 아님)", async () => {
    const out = await entry(await markdownToHwpx("# 제목\n\n## 참고1 자료\n\n- 결과 화면 캡처는 별도 첨부\n", { template: tpl }), "Contents/section0.xml")
    assert.deepEqual(paraOf(out, "결과 화면 캡처는 별도 첨부"), paraOf(tplSec, "견본 참고 항목"))
  })
})
