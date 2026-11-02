import { it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import MarkdownIt from "markdown-it"
import { markdownToHwpx, parseHwpx, patchHwpx } from "../src/index.js"
import { parseGfmTable } from "../src/roundtrip/markdown-units.js"
import { scanSectionXml } from "../src/roundtrip/source-map.js"

it("edits the second line inside a single-paragraph CRLF cell", async () => {
  const zip = await JSZip.loadAsync(await markdownToHwpx("| key | value |\n| --- | --- |\n| item | TARGET |"))
  const section = await zip.file("Contents/section0.xml")!.async("string")
  assert.ok(section.includes("<hp:t>TARGET</hp:t>"))
  const source = section.replace("<hp:t>TARGET</hp:t>", "<hp:t>first&#13;&#10;second</hp:t>")
  assert.equal(scanSectionXml(source, 0).tables[0].cellByAnchor.get("1,1")!.paragraphs.length, 1)
  zip.file("Contents/section0.xml", source)
  const original = new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }))
  const parsed = await parseHwpx(original.buffer, { layoutTables: "keep" })
  assert.ok(parsed.success)
  assert.equal(parsed.blocks.find(b => b.type === "table")!.table!.cells[1][1].text, "first\r\nsecond")
  assert.deepEqual(parseGfmTable(parsed.markdown.split("\n")), [["key", "value"], ["item", "first<br>second"]])
  const edited = parsed.markdown.replace("first<br>second", "first<br>edited")
  assert.notEqual(edited, parsed.markdown)
  assert.equal((new MarkdownIt({ html: true }).render(edited).match(/<tr>/g) ?? []).length, 2)
  const result = await patchHwpx(original, edited, { verify: true })
  assert.ok(result.success, result.error)
  assert.equal(result.applied, 1, JSON.stringify(result.skipped))
  assert.deepEqual(result.skipped, [])
  assert.ok(result.data)
  const reparsed = await parseHwpx(new Uint8Array(result.data).buffer, { layoutTables: "keep" })
  assert.ok(reparsed.success)
  const table = reparsed.blocks.find(b => b.type === "table")!.table!
  assert.equal(table.rows, 2)
  assert.equal(table.cols, 2)
  assert.deepEqual(table.cells.map(row => row.map(cell => cell.text)), [["key", "value"], ["item", "first\r\nedited"]])
  assert.equal(reparsed.markdown, edited)
  assert.deepEqual(result.verification?.stats, { added: 0, removed: 0, modified: 0, unchanged: result.verification!.stats.unchanged })
})


import { buildEmbeddedLineSplices } from "../src/roundtrip/embedded-line-patch.js"
import { allLinesegRemovalSplices, applySplices } from "../src/roundtrip/source-map.js"

for (const [name, newline, irNewline] of [
  ["CRLF", "&#13;&#10;", "\r\n"], ["CR", "&#13;", "\r"], ["LF", "&#10;", "\n"],
] as const) {
  for (const [row, col] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    it(name + " embedded line edit keeps coordinate " + row + "," + col + " and exact XML", async () => {
      const labels = [["key", "value"], ["item", "data"]]
      labels[row][col] = "TARGET"
      const zip = await JSZip.loadAsync(await markdownToHwpx("| " + labels[0].join(" | ") + " |\n| --- | --- |\n| " + labels[1].join(" | ") + " |"))
      const section = await zip.file("Contents/section0.xml")!.async("string")
      const source = section.replace("<hp:t>TARGET</hp:t>", "<hp:t>first" + newline + "second</hp:t>")
      zip.file("Contents/section0.xml", source)
      const original = await zip.generateAsync({ type: "arraybuffer" })
      const parsed = await parseHwpx(original, { layoutTables: "keep" })
      const edited = parsed.markdown.replace("first<br>second", "first<br>edited")
      const patched = await patchHwpx(new Uint8Array(original), edited, { verify: true })
      assert.ok(patched.success, patched.error)
      assert.equal(patched.applied, 1, JSON.stringify(patched.skipped))
      assert.deepEqual(patched.skipped, [])
      assert.equal(patched.verification!.stats.modified, 0)
      const reparsed = await parseHwpx(new Uint8Array(patched.data!).buffer, { layoutTables: "keep" })
      labels[row][col] = "first" + irNewline + "edited"
      assert.deepEqual(reparsed.blocks.find(b => b.type === "table")!.table!.cells.map(r => r.map(c => c.text)), labels)
      assert.equal(reparsed.markdown, edited)
      const outZip = await JSZip.loadAsync(patched.data!)
      assert.equal(await outZip.file("Contents/section0.xml")!.async("string"),
        applySplices(source.replace("second</hp:t>", "edited</hp:t>"), allLinesegRemovalSplices(source.replace("second</hp:t>", "edited</hp:t>"))))
    })
  }
}

function sourceParagraph(raws: string[]) {
  const xml = '<hp:sec><hp:p>' + raws.map((raw, i) => '<hp:run charPrIDRef="' + i + '"><hp:t>' + raw + '</hp:t></hp:run>').join("") + '</hp:p></hp:sec>'
  return { xml, para: scanSectionXml(xml, 0).bodyParagraphs[0] }
}

for (const [name, raws, lines, expected] of [
  ["split CRLF runs", ["first&#13;", "&#10;second"], ["first", "edited"], ["first&#13;", "&#10;edited"]],
  ["mixed separators", ["first&#13;&#10;second&#xD;third&#xA;fourth"], ["first", "edited", "third", "last"], ["first&#13;&#10;edited&#xD;third&#xA;last"]],
  ["named entities intact", ["first&amp;keep&#13;&#10;second&amp;keep"], ["first&keep", "edited&keep"], ["first&amp;keep&#13;&#10;edited&amp;keep"]],
  ["insert", ["first&#10;second"], ["first", "second!"], ["first&#10;second!"]],
  ["delete", ["first&#10;second!"], ["first", "second"], ["first&#10;second"]],
  ["escape new text", ["first&#10;second"], ["first", "second<&"], ["first&#10;second&lt;&amp;"]],
  ["numeric astral entity", ["first&#10;&#x1F600;keep"], ["first", "😁keep"], ["first&#10;😁keep"]],
  ["literal astral", ["first\n😀keep"], ["first", "😁keep"], ["first\n😁keep"]],
  ["line edge whitespace", ["  first  &#13;&#10;  second  "], ["first", "edited"], ["  first  &#13;&#10;  edited  "]],
] as [string, string[], string[], string[]][]) {
  it("precise line patch: " + name, () => {
    const { xml, para } = sourceParagraph(raws)
    const edits = buildEmbeddedLineSplices(para, xml, lines)
    assert.ok(edits)
    assert.equal(applySplices(xml, edits), sourceParagraph(expected).xml)
  })
}

for (const [name, raws, lines] of [
  ["literal br", ["first&lt;br&gt;extra&#10;second"], ["first", "edited"]],
  ["internal br tag", ["first<hp:br/>&#10;second"], ["first", "edited"]],
  ["CDATA", ["<![CDATA[first]]>&#10;second"], ["first", "edited"]],
  ["unknown entity", ["first&unknown;&#10;second"], ["first&unknown;", "edited"]],
  ["blank embedded line", ["first&#10;&#10;second"], ["first", "", "edited"]],
  ["line addition", ["first&#10;second"], ["first", "second", "third"]],
  ["line deletion", ["first&#10;second"], ["first"]],
  ["unstable spaces", ["first&#10;second"], ["first", "two  spaces"]],
  ["lone high surrogate", ["first&#10;second"], ["first", "edited\uD800"]],
  ["lone low surrogate", ["first&#10;second"], ["first", "edited\uDC00"]],
  ["invalid control", ["first&#10;second"], ["first", "edited\u0001"]],
] as [string, string[], string[]][]) {
  it("rejects ambiguous line patch: " + name, () => {
    const { xml, para } = sourceParagraph(raws)
    assert.equal(buildEmbeddedLineSplices(para, xml, lines), null)
  })
}


it("public patch path preserves CRLF split across two runs and an untouched entity", async () => {
  const zip = await JSZip.loadAsync(await markdownToHwpx("| key | value |\n| --- | --- |\n| item | TARGET |"))
  const section = await zip.file("Contents/section0.xml")!.async("string")
  const source = section.replace("<hp:t>TARGET</hp:t>", '<hp:t>first&amp;keep&#13;</hp:t></hp:run><hp:run charPrIDRef="0"><hp:t>&#10;second</hp:t>')
  zip.file("Contents/section0.xml", source)
  const original = await zip.generateAsync({ type: "arraybuffer" })
  const parsed = await parseHwpx(original, { layoutTables: "keep" })
  const edited = parsed.markdown.replace("second", "edited")
  const patched = await patchHwpx(new Uint8Array(original), edited, { verify: true })
  assert.equal(patched.applied, 1, JSON.stringify(patched.skipped))
  assert.deepEqual(patched.skipped, [])
  assert.equal(patched.verification!.stats.modified, 0)
  const out = await JSZip.loadAsync(patched.data!)
  const expected = source.replace("second</hp:t>", "edited</hp:t>")
  assert.equal(await out.file("Contents/section0.xml")!.async("string"), applySplices(expected, allLinesegRemovalSplices(expected)))
})
