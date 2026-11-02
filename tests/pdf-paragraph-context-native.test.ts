import { it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { extractPageBlocksWithLines } from "../src/pdf/page-blocks.js"

const fixture = JSON.parse(readFileSync(new URL("./fixtures/pdf-paragraph-context-native.json", import.meta.url), "utf8"))
const extract = () => extractPageBlocksWithLines(structuredClone(fixture.items), fixture.source.page,
  fixture.ops, fixture.source.width, fixture.source.height)
const sentences = [
  "- 구급차의 이동거리를 측정하여 이를 금액으로 표시하는 장치",
  "○ 장착대상(응급의료법 시행규칙 제38조제4항 [별표 16의2])",
  "- 의료기관(다만, 의료기관 중 「의료법」 제35조에 따라 개설된 부속 의료기관이 운용하는 구급차의 경우에는 장착하지 아니할 수 있음)",
]
for (const [i, text] of sentences.entries()) it("keeps native paragraph context and punctuation " + i, () => {
  const blocks = extract()
  const block = blocks.find(b => b.text === text)
  assert.ok(block, blocks.map(b => b.text).join("\n"))
  assert.equal(block.type, "list")
  assert.equal(block.listType, "unordered")
  assert.equal(blocks.filter(b => b.text === text).length, 1)
})
it("preserves the native margin badge, all body glyphs and the genuine table", () => {
  const blocks = extract()
  const badge = blocks.find(b => b.text?.trim() === "Ⅶ" || b.table?.cells.flat().some(c => c.text.trim() === "Ⅶ"))
  assert.deepEqual(badge?.bbox, { page: 49, x: 430.87606, y: 377.03206,
    width: 31.19999999999999, height: 28.319999999999993 })
  const table = blocks.find(b => b.type === "table" && b.table?.cols === 3)
  assert.deepEqual({ table: table?.table, bbox: table?.bbox }, fixture.expectedTable)
  const glyphs = (text: string) => [...text.replace(/<\/?u>|~~|\s/g, "")].sort().join("")
  const output = blocks.filter(b => b.type !== "image").flatMap(b => b.table
    ? b.table.cells.flat().map(c => c.text) : [b.text ?? ""]).join("")
  assert.equal(glyphs(output), glyphs(fixture.items.map((i: { text: string }) => i.text).join("")))
})

it("uses paragraph geometry with renamed Korean and Latin text", () => {
  const items = structuredClone(fixture.items)
  const replacements = new Map([
    ["구급차의 이동거리를 측정하여 이를 금액으로 표시하는 장치", "Sensor measures distance and displays the fare"],
    ["장착대상", "Applicable units"],
    ["의료기관", "기관"],
    ["조에 따라 개설된 부속 의료", "조에 따라 개설된 service unit"],
    ["기관이 운용하는 구급차의 경우에는 장착하지 아니할 수 있음", "The institution may omit the measuring device"],
  ])
  for (const item of items) item.text = replacements.get(item.text) ?? item.text
  const blocks = extractPageBlocksWithLines(items, 1, fixture.ops, fixture.source.width, fixture.source.height)
  assert.ok(blocks.some(b => b.type === "list" && b.text === "- Sensor measures distance and displays the fare"))
  assert.ok(blocks.some(b => b.type === "list" && b.text === "○ Applicable units(응급의료법 시행규칙 제38조제4항 [별표 16의2])"))
  assert.ok(blocks.some(b => b.type === "list" && /service unit The institution may omit the measuring device\)$/.test(b.text ?? "")))
})
