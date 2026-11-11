import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findRuledColumnDivider } from '../src/pdf/ruled-columns.js'
import { extractPageBlocksWithLines } from '../src/pdf/page-blocks.js'
import type { NormItem } from '../src/pdf/text-line.js'
const boxes = [100, 400].flatMap(x => [100, 300, 500].map(y => ({ x, y, w: 180, h: 120 })))
const divider = { x1: 320, x2: 320, y1: 70, y2: 760, lineWidth: 1 }
test('separates independent table regions on both sides of a long divider', () => {
  assert.equal(findRuledColumnDivider(boxes, [], [divider], 640, 840), 320)
})
test('rejects a table column joined by a horizontal rule in the body', () => {
  assert.equal(findRuledColumnDivider(boxes, [{ x1: 100, x2: 580, y1: 350, y2: 350, lineWidth: 1 }], [divider], 640, 840), null)
})
test('rejects a full width body region and an unbalanced sidebar', () => {
  assert.equal(findRuledColumnDivider([...boxes, {x: 100, y: 350, w:480, h:40}], [], [divider], 640,840),null)
  assert.equal(findRuledColumnDivider(boxes.slice(0,4), [], [divider],640,840),null)
})
test('keeps full width header and footer outside independent body regions', () => {
  assert.equal(findRuledColumnDivider([...boxes,{x:100,y:780,w:480,h:20},{x:300,y:20,w:40,h:20}], [{x1:100,x2:580,y1:770,y2:770,lineWidth:1}], [divider],640,840),320)
})

test('OCR text overlapping the divider is emitted once and crossing text is retained', () => {
  const item = (text: string, x: number, y: number, w: number): NormItem =>
    ({ text, x, y, w, h: 10, fontSize: 10, fontName: 'ocr', isHidden: false })
  const columns = [100, 400].flatMap((x, side) =>
    [650, 550, 450].map((y, row) => item(`column${side}${row}`, x, y, 60)))
  const near = item('neardivider', 319, 350, 2)
  const crossing = item('crossdivider', 300, 250, 40)
  for (const items of [[...columns, near], [...columns, near, crossing]]) {
    const blocks = extractPageBlocksWithLines(items, 1, { fnArray: [], argsArray: [] }, 640, 840,
      { horizontals: [], verticals: [divider] }, false)
    const text = blocks.map(block => block.text ?? '').join(' ')
    for (const source of items) {
      assert.equal(text.split(source.text).length - 1, 1, `${source.text} in ${text}`)
    }
  }
})
