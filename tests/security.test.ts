/**
 * 보안 로직 테스트 — 방어적 상수 및 입력 검증
 *
 * 모든 테스트가 실제 소스 코드를 직접 import하여 검증.
 * 로직 복제 없음 — 소스가 변경되면 테스트도 함께 깨짐.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readRecords, extractText } from "../src/hwp5/record.js"
import { buildTable, MAX_COLS, MAX_ROWS } from "../src/table/builder.js"
import { KordocError, sanitizeError, isPathTraversal } from "../src/utils.js"
import type { CellContext } from "../src/types.js"

// ─── readRecords: MAX_RECORDS 제한 ─────────────────────

describe("readRecords — MAX_RECORDS 제한", () => {
  it("500,000개 초과 레코드는 잘림 + 잘림 전 데이터 정합성", () => {
    const recordCount = 500_001
    const buf = Buffer.alloc(recordCount * 4)
    for (let i = 0; i < recordCount; i++) {
      // tagId = i의 하위 10비트, level=0, size=0
      buf.writeUInt32LE((i & 0x3ff) | (0 << 10) | (0 << 20), i * 4)
    }
    const records = readRecords(buf)
    assert.equal(records.length, 500_000)
    // 잘림 전 데이터 정합성 — 첫 번째와 마지막 레코드의 tagId 검증
    assert.equal(records[0].tagId, 0)
    assert.equal(records[499_999].tagId, 499_999 & 0x3ff)
    assert.equal(records[499_999].size, 0)
  })
})

// ─── buildTable: 악성 span 값 ────────────────────────────

describe("buildTable — 악성 span 값 방어", () => {
  it("극단적 colSpan/rowSpan에도 크래시 없이 테이블 생성", () => {
    const rows: CellContext[][] = [
      [{ text: "A", colSpan: 9999, rowSpan: 9999 }],
    ]
    const table = buildTable(rows)
    assert.equal(table.rows, 1)
    assert.ok(table.cols >= 1)
  })

  it("MAX_ROWS 초과 행은 잘림", () => {
    const rows: CellContext[][] = Array.from({ length: MAX_ROWS + 1 }, () => [
      { text: "x", colSpan: 1, rowSpan: 1 },
    ])
    const table = buildTable(rows)
    assert.equal(table.rows, MAX_ROWS)
  })
})

// ─── extractText: 제어문자 코드 10 (강제 줄바꿈) ──────────────

describe("extractText — 제어문자 코드 10 처리", () => {
  it("코드 10(강제 줄바꿈)은 char 타입 2바이트 — 뒤 14바이트를 소비하지 않음", () => {
    // 회귀: 코드 10을 확장 컨트롤(각주/미주는 코드 17)로 오인해 뒤 14바이트(7글자)를 먹던 자료손상 버그.
    // 코드 10은 char 타입 줄바꿈(2바이트)이라 뒤 텍스트가 그대로 보존돼야 한다.
    const tail = "일이삼사오육칠"  // 7글자 = 14바이트
    const buf = Buffer.alloc(2 + tail.length * 2)
    buf.writeUInt16LE(0x000a, 0)
    for (let k = 0; k < tail.length; k++) buf.writeUInt16LE(tail.charCodeAt(k), 2 + k * 2)
    assert.equal(extractText(buf), "\n" + tail)  // 옛 버그면 "\n"만, 정상이면 7글자 전부 보존
  })

  it("코드 10 + 일반 텍스트 → 줄바꿈 뒤 텍스트 그대로", () => {
    const buf = Buffer.alloc(6)
    buf.writeUInt16LE(0x000a, 0)
    buf.writeUInt16LE("A".charCodeAt(0), 2)
    buf.writeUInt16LE("B".charCodeAt(0), 4)
    assert.equal(extractText(buf), "\nAB")
  })
})

// ─── isPathTraversal — 실제 utils.ts 함수 직접 테스트 ──────

describe("isPathTraversal — 실제 함수 테스트", () => {
  it("악성 경로는 true 반환", () => {
    const malicious = [
      "..\\..\\etc\\passwd",
      "Contents\\..\\..\\secret.xml",
      "C:\\Windows\\system32\\config",
      "/etc/passwd",
      "../../../secret",
    ]
    for (const name of malicious) {
      assert.equal(isPathTraversal(name), true, `"${name}" → true`)
    }
  })

  it("정상 경로는 false 반환", () => {
    const safe = [
      "Contents/section0.xml",
      "section1.xml",
      "Contents/Sub/section2.xml",
    ]
    for (const name of safe) {
      assert.equal(isPathTraversal(name), false, `"${name}" → false`)
    }
  })
})

// ─── sanitizeError — 실제 utils.ts 함수 직접 테스트 ────────

describe("sanitizeError — 실제 함수 테스트", () => {
  it("KordocError는 메시지 그대로 반환", () => {
    const messages = [
      "빈 버퍼이거나 유효하지 않은 입력입니다.",
      "암호화된 HWP는 지원하지 않습니다",
      "ZIP 압축 해제 크기 초과 (ZIP bomb 의심)",
      "파일 경로가 비어있습니다",
    ]
    for (const msg of messages) {
      assert.equal(sanitizeError(new KordocError(msg)), msg)
    }
  })

  it("일반 Error는 일반 메시지로 대체 — 경로·트레이스 노출 없음", () => {
    const unsafeErrors = [
      new Error("Cannot read properties at /opt/app/node_modules/pdfjs-dist/build/pdf.js:1234"),
      new Error("EACCES: permission denied, open '/home/user/.ssh/id_rsa'"),
      "string error with C:\\path\\leak",
    ]
    for (const err of unsafeErrors) {
      assert.equal(sanitizeError(err), "문서 처리 중 오류가 발생했습니다")
    }
  })

  it("ENOENT 는 구분 문구로 바꾸되 파일 경로는 노출하지 않는다", () => {
    // 파일시스템 오류는 code 로, 래핑된 오류는 메시지로 온다 — 둘 다 같은 취급
    const byMessage = new Error("ENOENT: no such file, open 'C:\\Users\\admin\\secret.hwp'")
    const byCode = Object.assign(new Error("ENOENT: no such file or directory, stat 'C:\\Users\\admin\\secret.hwp'"), {
      code: "ENOENT",
    })
    for (const err of [byMessage, byCode]) {
      const msg = sanitizeError(err)
      assert.equal(msg, "파일 또는 디렉토리를 찾을 수 없습니다")
      assert.ok(!msg.includes("secret.hwp"), "파일명이 새지 않는다")
      assert.ok(!msg.includes("C:\\Users"), "경로가 새지 않는다")
    }
  })
})

// ─── KordocError — instanceof 체인 검증 ─────────────────

describe("KordocError", () => {
  it("Error의 서브클래스이며 name이 KordocError", () => {
    const err = new KordocError("test")
    assert.ok(err instanceof Error)
    assert.ok(err instanceof KordocError)
    assert.equal(err.name, "KordocError")
    assert.equal(err.message, "test")
  })
})

describe("readZipEntry — 엔트리를 압축 해제 상한까지만 푼다 (rhwp #7602)", () => {
  // 중앙 디렉터리 크기 필드를 속인 엔트리는 사전 검사를 지나 다 풀린 뒤에야 걸렸다 — 읽는 도중에 끊는다
  const entry = async (text: string) => {
    const JSZip = (await import("jszip")).default
    const zip = new JSZip()
    zip.file("a.xml", text)
    return (await JSZip.loadAsync(await zip.generateAsync({ type: "uint8array" }))).file("a.xml")!
  }
  it("상한 안이면 JSZip async 와 같은 글", async () => {
    const { readZipEntry } = await import("../src/hwpx/parser-shared.js")
    const file = await entry("\ufeff<가>본문</가>")
    assert.equal(await readZipEntry(file, "text"), await file.async("text"))
    assert.deepEqual(await readZipEntry(file, "uint8array"), await file.async("uint8array"))
  })
  it("이미 푼 누적량과 합쳐 상한을 넘으면 ZipBombError", async () => {
    const { readZipEntry, MAX_DECOMPRESS_SIZE, ZipBombError } = await import("../src/hwpx/parser-shared.js")
    const file = await entry("x".repeat(4096))
    await assert.rejects(readZipEntry(file, "text", MAX_DECOMPRESS_SIZE - 100), ZipBombError)
  })
})

describe("COM 폴백 PowerShell — 파일 이름 명령 주입", () => {
  it("파일 경로는 스크립트에 넣지 않고 환경 변수로만 넘긴다 — 둥근 따옴표(’)로 문자열을 닫아 명령을 심을 수 없다", async () => {
    const { comPowerShellInvocation } = await import("../src/hwpx/com-fallback.js")
    const evil = "C:\\in\\민원’;Start-Process calc;’.hwpx"
    const { args, env } = comPowerShellInvocation(evil)
    assert.ok(args.every(a => !a.includes("Start-Process calc")), "인자에 경로 없음")
    assert.equal(env.KORDOC_COM_SRC, evil)
    assert.ok(args[args.length - 1].includes("$src = $env:KORDOC_COM_SRC"))
  })
})

describe("htmlTables — 칸 글의 원시 태그", () => {
  it("문서 글의 \\<img onerror> 는 이스케이프하고 kordoc 그림 태그·<br>·<u> 만 둔다", async () => {
    const { toHtmlTables } = await import("../src/html-tables.js")
    const out = toHtmlTables("| a | b |\n| --- | --- |\n| \\<img src=x onerror=alert(1)> | <img src=\"images/doc/image_1.png\" alt=\"image\"><br>x<u>y</u> |")
    assert.ok(!/<img [^>]*onerror/i.test(out), out)
    assert.ok(out.includes("&lt;img src=x onerror=alert(1)&gt;"))
    assert.ok(out.includes(`<img src="images/doc/image_1.png" alt="image"><br>x<u>y</u>`))
  })
})

describe("Markdown 출력 — 원시 HTML·위험 링크", () => {
  it("문서 글의 [x](javascript:…)·참조 정의·역슬래시 우회는 살아 있는 링크가 되지 않는다", async () => {
    const { escapeGfm } = await import("../src/table/builder.js")
    const MarkdownIt = (await import("markdown-it")).default
    const md = new MarkdownIt({ html: true })
    for (const t of ["[클릭](javascript:alert(1))", "[x\\](javascript:alert(1))", "[a]: javascript:alert(1)\n\n[a]", "![x](javascript:alert(1))"])
      assert.ok(!/<a |<img /.test(md.render(escapeGfm(t))), t)
    // kordoc 이 내는 안전 스킴 링크·그림 참조는 그대로
    assert.ok(md.render(escapeGfm("[붙임](https://example.com/a)")).includes('<a href="https://example.com/a">'))
    assert.ok(md.render(escapeGfm("![image](image_001.png)")).includes('<img src="image_001.png"'))
  })
  it("코드 스팬 안 백틱은 스팬을 닫지 못한다, span 경로 각주도 이스케이프한다", async () => {
    const { blocksToMarkdown } = await import("../src/table/builder.js")
    const MarkdownIt = (await import("markdown-it")).default
    const md = new MarkdownIt({ html: true })
    const code = blocksToMarkdown([{ type: "paragraph", text: "a` <img src=x onerror=alert(1)> `b", spans: [{ text: "a` <img src=x onerror=alert(1)> `b", code: true }] } as never])
    assert.ok(!/<img /.test(md.render(code)), code)
    const note = blocksToMarkdown([{ type: "paragraph", text: "본문", spans: [{ text: "본문", bold: true }], footnoteText: "<img src=x onerror=alert(1)>" } as never])
    assert.ok(!/<img /.test(md.render(note)), note)
  })
})

describe("Chromium 샌드박스 · MCP 등록 버전 고정", () => {
  it("인쇄·렌더 Chromium 은 기본 샌드박스 — root Linux 또는 KORDOC_CHROMIUM_NO_SANDBOX=1 일 때만 끈다", async () => {
    const { chromiumSandboxArgs } = await import("../src/print/renderer.js")
    assert.deepEqual(chromiumSandboxArgs({}, false), [])
    assert.ok(chromiumSandboxArgs({ KORDOC_CHROMIUM_NO_SANDBOX: "1" }, false).includes("--no-sandbox"))
    assert.ok(chromiumSandboxArgs({}, true).includes("--no-sandbox"))
  })
  it("setup 이 등록하는 npx 패키지는 지금 버전으로 고정한다(개발 빌드만 고정 없이)", async () => {
    const { npxPackageSpec } = await import("../src/setup.js")
    assert.equal(npxPackageSpec("4.21.30"), "kordoc@4.21.30")
    assert.equal(npxPackageSpec("0.0.0-dev"), "kordoc")
  })
})

describe("MCP 쓰기 경로 — 숨김 경로·에이전트 지침 파일", () => {
  it("문서 속 지시로 ~/.claude/CLAUDE.md·AGENTS.md·.mcp.json 을 덮어쓰지 못한다, 보통 경로는 그대로", async () => {
    const { safeOutputPath } = await import("../src/mcp/shared.js")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const md = new Set([".md"]), js = new Set([".json"])
    assert.throws(() => safeOutputPath(join(tmpdir(), "kordoc-sec", ".claude", "CLAUDE.md"), md), /숨김 경로/)
    assert.throws(() => safeOutputPath(join(tmpdir(), "kordoc-sec", "AGENTS.md"), md), /에이전트 설정/)
    assert.throws(() => safeOutputPath(join(tmpdir(), "kordoc-sec", ".mcp.json"), js), /숨김 경로/)
    assert.ok(safeOutputPath(join(tmpdir(), "kordoc-sec", "결과.md"), md).endsWith("결과.md"))
  })
})

describe("ZIP 엔트리 — 중앙 디렉터리 선언 크기", () => {
  it("선언 크기를 속여(작게) 담은 엔트리는 선언 크기를 넘는 순간 끊는다 — 사전 검사의 선언 합계가 실제 상한이 된다", async () => {
    const JSZip = (await import("jszip")).default
    const { readZipEntry, ZipBombError } = await import("../src/hwpx/parser-shared.js")
    const z = new JSZip()
    z.file("document.xml", "x".repeat(200_000))
    const bytes = Buffer.from(await z.generateAsync({ type: "uint8array", compression: "DEFLATE" }))
    // 지역 헤더(PK\3\4, 오프셋 22)·중앙 디렉터리(PK\1\2, 오프셋 24)의 비압축 크기를 100 으로 속인다
    const cd = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    bytes.writeUInt32LE(100, 22)
    bytes.writeUInt32LE(100, cd + 24)
    const forged = (await JSZip.loadAsync(bytes)).file("document.xml")!
    await assert.rejects(readZipEntry(forged, "text"), ZipBombError)
    // 중앙 디렉터리만 속이면 사전 검사는 지역 헤더 크기를 센다
    const { precheckZipSize } = await import("../src/utils.js")
    const cdOnly = Buffer.from(await z.generateAsync({ type: "uint8array", compression: "DEFLATE" }))
    cdOnly.writeUInt32LE(100, cdOnly.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24)
    assert.equal(precheckZipSize(cdOnly.buffer.slice(cdOnly.byteOffset, cdOnly.byteOffset + cdOnly.length)).totalUncompressed, 200_000)
    // 정상 파일은 그대로
    const ok = (await JSZip.loadAsync(await z.generateAsync({ type: "uint8array", compression: "DEFLATE" }))).file("document.xml")!
    assert.equal((await readZipEntry(ok, "text")).length, 200_000)
  })
})

describe("렌더·웹훅 심층 방어", () => {
  it("문서 색 값은 #RRGGBB 만 통과한다", async () => {
    const { docColor } = await import("../src/render/head-styles.js")
    assert.equal(docColor("#3E7AA6"), "#3E7AA6")
    assert.equal(docColor("url(#x)"), undefined)
    assert.equal(docColor("red;stroke:url(http://e)", "#000000"), "#000000")
  })
  it("레이아웃 HTML 은 CSP 로 스크립트·외부 요청을 막는다", async () => {
    const { renderSceneToHtml } = await import("../src/render/html.js")
    const html = renderSceneToHtml({ pages: [{ page: 1, width: 595, height: 842 }] } as never, new Map([[1, "<svg/>"]]))
    assert.ok(/Content-Security-Policy" content="default-src 'none'/.test(html))
  })
  it("웹훅 사설·특수 대역(198.18/15·192.0.0/24·멀티캐스트·예약·ff00::/8)을 거부한다", async () => {
    const { isPrivateIp } = await import("../src/watch.js")
    for (const ip of ["198.18.0.1", "198.19.255.1", "192.0.0.8", "224.0.0.1", "239.1.1.1", "255.255.255.255", "ff02::1"]) assert.equal(isPrivateIp(ip), true, ip)
    for (const ip of ["8.8.8.8", "198.20.0.1", "2001:4860:4860::8888"]) assert.equal(isPrivateIp(ip), false, ip)
  })
})
