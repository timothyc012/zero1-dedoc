import { test } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { parseHwpx } from "../src/index.js"
import { resolveSectionPaths } from "../src/hwpx/zip-sections.js"
import { resolveSectionEntryNames } from "../src/roundtrip/hwpx-entries.js"

for (const prefix of ["opf", "pkg", ""]) {
  test(`HWPX manifest ${prefix || "default"} namespace preserves spine order in parser and editing paths`, async () => {
    const tag = (name: string) => prefix ? `${prefix}:${name}` : name
    const ns = prefix ? `xmlns:${prefix}` : "xmlns"
    const zip = new JSZip()
    zip.file("mimetype", "application/hwp+zip")
    zip.file("Contents/content.hpf", `<${tag("package")} ${ns}="http://www.idpf.org/2007/opf/">
      <${tag("manifest")}><${tag("item")} id="s0" href="Contents/section0.xml"/><${tag("item")} id="s1" href="Contents/section1.xml"/></${tag("manifest")}>
      <${tag("spine")}><${tag("itemref")} idref="s1"/><${tag("itemref")} idref="s0"/></${tag("spine")}>
      </${tag("package")}>`)
    for (const [i, text] of [[0, "둘째 본문"], [1, "첫째 본문"]] as const) {
      zip.file(`Contents/section${i}.xml`, `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"><hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p></hs:sec>`)
    }
    const expected = ["Contents/section1.xml", "Contents/section0.xml"]
    assert.deepEqual(await resolveSectionPaths(zip), expected)
    assert.deepEqual(await resolveSectionEntryNames(zip), expected)
    const result = await parseHwpx(await zip.generateAsync({ type: "arraybuffer" }))
    assert.ok(result.success)
    assert.ok(result.markdown.indexOf("첫째 본문") < result.markdown.indexOf("둘째 본문"))
    assert.equal(result.blocks.find(block => block.text === "첫째 본문")?.pageNumber, 1)
  })
}
