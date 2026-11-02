import { describe, it } from "node:test"
import assert from "node:assert/strict"
import MarkdownIt from "markdown-it"
import JSZip from "jszip"
import { markdownToHwpx, parseHwpx, patchHwpx } from "../src/index.js"
import { blocksToMarkdown } from "../src/table/builder.js"
import { parseGfmTable, replicateGfmTable } from "../src/roundtrip/markdown-units.js"
import type { IRBlock, IRTable } from "../src/types.js"

const renderer = new MarkdownIt({ html: true })

function assertCells(md: string, expected: string[][]): void {
  const html = renderer.render(md)
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(row =>
    [...row[1].matchAll(/<t[hd]>([\s\S]*?)<\/t[hd]>/g)].map(cell => cell[1]))
  assert.deepEqual(rows, expected, html)
  assert.equal((html.match(/<table>/g) ?? []).length, 1, html)
  assert.ok(!md.includes("\r"), md)
}

describe("GFM 셀 줄바꿈", () => {
  it("CRLF는 하나의 <br>로 렌더링하고 2×2 셀 대응과 원본 IR을 유지한다", () => {
    const blocks: IRBlock[] = [{
      type: "table",
      table: {
        rows: 2, cols: 2, hasHeader: true,
        cells: [
          [{ text: "key", colSpan: 1, rowSpan: 1 }, { text: "value", colSpan: 1, rowSpan: 1 }],
          [{ text: "item", colSpan: 1, rowSpan: 1 }, { text: "first\r\nsecond", colSpan: 1, rowSpan: 1 }],
        ],
      },
    }]
    const original = structuredClone(blocks)
    const md = blocksToMarkdown(blocks)
    const html = renderer.render(md)
    assert.equal((html.match(/<tr>/g) ?? []).length, 2, html)
    assert.equal(html, "<table>\n<thead>\n<tr>\n<th>key</th>\n<th>value</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>item</td>\n<td>first<br>second</td>\n</tr>\n</tbody>\n</table>\n")
    assert.equal(md, "| key | value |\n| --- | --- |\n| item | first<br>second |")
    assert.deepEqual(blocks, original)
  })

  for (const [name, text, expected] of [
    ["CRLF", "first\r\nsecond", "first<br>second"],
    ["CR", "first\rsecond", "first<br>second"],
    ["LF", "first\nsecond", "first<br>second"],
    ["혼합·연속", "first\r\n\r\nsecond\rthird\nfourth", "first<br><br>second<br>third<br>fourth"],
  ]) {
    for (const bold of [false, true]) {
      for (const [r, c] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        it(`${name} ${bold ? "강조 span" : "일반 글"} (${r},${c}) 셀의 값·위치를 유지한다`, () => {
          const labels = [["key", "value"], ["item", "data"]]
          const cells = labels.map(row => row.map(text => ({ text, colSpan: 1, rowSpan: 1 })))
          const blocks: IRBlock[] = [{ type: "table", table: { rows: 2, cols: 2, hasHeader: true, cells } }]
          blocks[0].table!.cells[r][c] = {
            text, colSpan: 1, rowSpan: 1,
            ...(bold ? { blocks: [{ type: "paragraph" as const, text, spans: [{ text, bold: true }] }] } : {}),
          }
          const original = structuredClone(blocks)
          const md = blocksToMarkdown(blocks)
          const expectedMd = labels.map(row => [...row])
          expectedMd[r][c] = bold ? `**${expected}**` : expected
          assert.equal(md, `| ${expectedMd[0].join(" | ")} |\n| --- | --- |\n| ${expectedMd[1].join(" | ")} |`)
          const expectedHtml = labels.map(row => [...row])
          expectedHtml[r][c] = bold ? `<strong>${expected}</strong>` : expected
          assertCells(md, expectedHtml)
          assert.deepEqual(blocks, original)
        })
      }
    }
  }

  it("CRLF 옆 파이프·기존 이스케이프·역슬래시 처리를 유지한다", () => {
    const md = blocksToMarkdown([{
      type: "table",
      table: { rows: 2, cols: 2, hasHeader: true, cells: [
        [{ text: "key", colSpan: 1, rowSpan: 1 }, { text: "value", colSpan: 1, rowSpan: 1 }],
        [{ text: "item", colSpan: 1, rowSpan: 1 }, { text: "a|b\r\nc\\|d\rpath\\name\nend", colSpan: 1, rowSpan: 1 }],
      ] },
    }])
    assert.equal(md, "| key | value |\n| --- | --- |\n| item | a\\|b<br>c\\|d<br>path\\name<br>end |")
    assertCells(md, [["key", "value"], ["item", "a|b<br>c|d<br>path\\name<br>end"]])
  })

  it("HWPX hp:t의 CRLF 문자 참조도 2×2 GFM 표와 IR 원문을 유지한다", async () => {
    const zip = await JSZip.loadAsync(await markdownToHwpx("| key | value |\n| --- | --- |\n| item | NEWLINE_CELL |"))
    const section = await zip.file("Contents/section0.xml")!.async("string")
    assert.ok(section.includes("<hp:t>NEWLINE_CELL</hp:t>"))
    zip.file("Contents/section0.xml", section.replace("<hp:t>NEWLINE_CELL</hp:t>", "<hp:t>first&#13;&#10;second</hp:t>"))
    const result = await parseHwpx(await zip.generateAsync({ type: "arraybuffer" }), { layoutTables: "keep" })
    assert.ok(result.success)
    const table = result.blocks.find(block => block.type === "table")!.table!
    assert.equal(table.rows, 2)
    assert.equal(table.cols, 2)
    assert.equal(table.cells[1][1].text, "first\r\nsecond")
    assert.equal(result.markdown.trim(), "| key | value |\n| --- | --- |\n| item | first<br>second |")
    assertCells(result.markdown, [["key", "value"], ["item", "first<br>second"]])
  })

  for (const [name, newline] of [["CRLF", "\r\n"], ["CR", "\r"], ["LF", "\n"]]) {
    it(`${name} 셀의 GFM 재현 텍스트·좌표가 실제 렌더 파싱과 일치한다`, () => {
      const labels = [["key", "value"], ["item", "data"]]
      const table: IRTable = {
        rows: 2, cols: 2, hasHeader: true,
        cells: labels.map(row => row.map(text => ({ text: `${text}${newline}line`, colSpan: 1, rowSpan: 1 }))),
      }
      const md = blocksToMarkdown([{ type: "table", table }])
      const rows = parseGfmTable(md.split("\n"))
      assert.deepEqual(rows, labels.map(row => row.map(text => `${text}<br>line`)))
      assert.deepEqual(replicateGfmTable(table), rows.map((row, gridR) =>
        row.map((text, gridC) => ({ text, gridR, gridC }))))
    })
  }

  it("patchHwpx는 CRLF 셀을 보존하면서 같은 표의 다른 셀을 수정한다", async () => {
    const zip = await JSZip.loadAsync(await markdownToHwpx("| key | value |\n| --- | --- |\n| item | NEWLINE_CELL |"))
    const section = await zip.file("Contents/section0.xml")!.async("string")
    const newlineXml = "<hp:t>first&#13;&#10;second</hp:t>"
    assert.ok(section.includes("<hp:t>NEWLINE_CELL</hp:t>"))
    zip.file("Contents/section0.xml", section.replace("<hp:t>NEWLINE_CELL</hp:t>", newlineXml))
    const original = await zip.generateAsync({ type: "arraybuffer" })
    const parsed = await parseHwpx(original, { layoutTables: "keep" })
    assert.ok(parsed.success)
    assert.equal(parsed.blocks.find(block => block.type === "table")!.table!.cells[1][1].text, "first\r\nsecond")
    const edited = parsed.markdown.replace("| item |", "| edited |")
    assert.notEqual(edited, parsed.markdown)

    const result = await patchHwpx(new Uint8Array(original), edited, { verify: true })
    assert.ok(result.success, result.error)
    assert.deepEqual(result.skipped, [])
    assert.equal(result.applied, 1)
    assert.ok(result.data)
    assert.deepEqual(result.verification?.stats, { added: 0, removed: 0, modified: 0, unchanged: result.verification!.stats.unchanged })

    const reparsed = await parseHwpx(new Uint8Array(result.data).buffer, { layoutTables: "keep" })
    assert.ok(reparsed.success)
    assert.equal(reparsed.markdown, edited)
    const table = reparsed.blocks.find(block => block.type === "table")!.table!
    assert.deepEqual(table.cells.map(row => row.map(cell => cell.text)), [["key", "value"], ["edited", "first\r\nsecond"]])
    const patchedZip = await JSZip.loadAsync(result.data)
    assert.ok((await patchedZip.file("Contents/section0.xml")!.async("string")).includes(newlineXml))
  })
})
