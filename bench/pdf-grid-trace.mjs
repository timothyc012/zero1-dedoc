#!/usr/bin/env node
/** Opt-in PDF line/clip/grid trace; no production parser behavior is changed. */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import "../src/pdf/polyfill.js"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs"
import { parse } from "../dist/index.js"
import { normalizeItems, filterHiddenText } from "../src/pdf/text-line.js"
import { extractLines, preprocessLines, filterPageBorderLines, closeOpenTableEdges, buildTableGrids, extractCells, mapTextToCells } from "../src/pdf/line-detector.js"
import { chainShortSegments } from "../src/pdf/line-extract.js"
import { fillBlanks } from "../src/pdf/blank-fills.js"
import { buildClipCellGrids, dropGridsInside } from "../src/pdf/clip-cells.js"
import { dropShadingClipGrids, dropInsetClipGrids, dropHeadBandClipGrids, dropCoarseClipGrids } from "../src/pdf/table-grid.js"
import { closeOpenTableEnds } from "../src/pdf/open-table-ends.js"
import { bridgeSplitColumnVerticals } from "../src/pdf/vertical-bridge.js"
import { bridgeSkippedRowVerticals } from "../src/pdf/vertical-bridge.js"
import { extendHeaderBoxRows } from "../src/pdf/header-box-rows.js"
import { markUnderlineItems } from "../src/pdf/underline.js"
import { preferDenseRuledGrids } from "../src/pdf/page-blocks.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const pdfPath = resolve(option("--pdf") ?? join(root, "bench/corpus/office-pdf/bmf-tax-tables.pdf"))
const outDir = resolve(option("--out") ?? join(root, "bench/out/bmf-grid-trace"))
const pageRange = option("--pages") ?? "4-11"
if (!/^\d+-\d+$/.test(pageRange)) throw new Error("--pages must be START-END")
const [start, end] = pageRange.split("-").map(Number)
if (start < 1 || end < start) throw new Error("Invalid page range")
const expectedHash = "1bbaae9366524c2830b52092b9e6a5f9b9bdb5a801402e48dd9e58d32385c4b2"
const bytes = await readFile(pdfPath)
const hash = createHash("sha256").update(bytes).digest("hex")
if (hash !== expectedHash) throw new Error(`BMF PDF SHA-256 mismatch: ${hash}`)
GlobalWorkerOptions.workerSrc = ""
const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise
if (end > doc.numPages) throw new Error(`Page range exceeds ${doc.numPages}`)
const parsed = await parse(bytes, { ocr: false, images: false })
if (!parsed.success) throw new Error(`Zero1 parse failed: ${parsed.error}`)
await mkdir(outDir, { recursive: true })

const round = n => Math.round(n * 100) / 100
const line = segment => ({ x1: round(segment.x1), y1: round(segment.y1), x2: round(segment.x2), y2: round(segment.y2), width: round(segment.lineWidth) })
const grid = item => ({ bbox: Object.fromEntries(Object.entries(item.bbox).map(([k,v]) => [k,round(v)])), rows: item.rowYs.length - 1, cols: item.colXs.length - 1, rowYs: item.rowYs.map(round), colXs: item.colXs.map(round), clip: !!item.cells, clipParent:item.clipParent??null })
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[char])
const svgLine = (segment, height, color, width = 1, opacity = 1) => `<line x1="${round(segment.x1)}" y1="${round(height-segment.y1)}" x2="${round(segment.x2)}" y2="${round(height-segment.y2)}" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`
const svgBox = (box, height, color, opacity = 1, width = 1) => `<rect x="${round(box.x1)}" y="${round(height-box.y2)}" width="${round(box.x2-box.x1)}" height="${round(box.y2-box.y1)}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`
const pages = []
let previousClip
for (let pageNumber = 1; pageNumber <= end; pageNumber++) {
  const page = await doc.getPage(pageNumber)
  const [originX, originY, maxX, maxY] = page.view
  const width = maxX-originX, height = maxY-originY
  if (originX !== 0 || originY !== 0 || page.rotate % 360 !== 0) {
    throw new Error(`Page ${pageNumber}: this diagnostic requires unrotated PDF pages with a zero CropBox origin`)
  }
  const tc = await page.getTextContent()
  const ops = await page.getOperatorList()
  let items = filterHiddenText(normalizeItems(tc.items), width, height, originX, originY).visible
  if (originX || originY) items = items.map(item => ({ ...item, x:item.x-originX, y:item.y-originY }))
  const extracted = extractLines(ops.fnArray, ops.argsArray)
  let { horizontals, verticals } = extracted
  const raw = { horizontals: horizontals.map(line), verticals: verticals.map(line), clips: extracted.clipRects.length }
  const filled = fillBlanks(items, horizontals, verticals)
  items = filled.items
  horizontals = filled.horizontals
  const clipResult = buildClipCellGrids(extracted.clipRects, horizontals, verticals, width, height,
    items.map(item => ({ x:item.x+item.w/2, y:item.y+item.h/2 })), extracted.fillRects, previousClip)
  previousClip = clipResult.page
  const clipGrids = clipResult.grids
  if (clipGrids.length === 0) {
    horizontals = chainShortSegments(horizontals, extracted.shortH, "h")
    verticals = chainShortSegments(verticals, extracted.shortV, "v")
  }
  ;({ horizontals, verticals } = filterPageBorderLines(horizontals, verticals, width, height))
  ;({ horizontals, verticals } = preprocessLines(horizontals, verticals))
  horizontals = closeOpenTableEnds(horizontals, verticals, items.every(item => item.seq !== undefined))
  verticals = closeOpenTableEdges(horizontals, verticals)
  verticals = bridgeSplitColumnVerticals(horizontals, verticals)
  if (clipGrids.length === 0) verticals = bridgeSkippedRowVerticals(horizontals, verticals, items)
  if (clipGrids.length === 0) ({ horizontals, verticals } = extendHeaderBoxRows(horizontals, verticals, items))
  const underlines = new Set(markUnderlineItems(items, horizontals, verticals))
  if (underlines.size) horizontals = horizontals.filter(item => !underlines.has(item))
  const lineGrids = buildTableGrids(horizontals, verticals, items)
  const afterShading = dropShadingClipGrids(clipGrids, lineGrids, extracted.fillRects, verticals)
  const afterInset = dropInsetClipGrids(afterShading, lineGrids)
  const afterHead = dropHeadBandClipGrids(afterInset, lineGrids)
  const tableClipGrids = dropCoarseClipGrids(afterHead, lineGrids, verticals, items)
  const lineAfterClip = dropGridsInside(lineGrids, tableClipGrids, [])
  const lineAfterContainer = dropGridsInside(lineGrids, tableClipGrids, clipResult.containers)
  const retained = preferDenseRuledGrids(lineGrids, tableClipGrids, clipResult.containers, horizontals, verticals, items)
  if (pageNumber < start) { page.cleanup(); continue }

  const affiliations = []
  const owners = new Map()
  const candidateLineGrids = lineGrids.map(candidate => {
    const cells = extractCells(candidate, horizontals, verticals)
    const mapped = mapTextToCells(items,cells)
    return { rows:candidate.rowYs.length-1, cols:candidate.colXs.length-1, cellCount:cells.length,
      fullSpanCells:cells.filter(cell=>cell.colSpan===candidate.colXs.length-1).length,
      mergedCells:cells.filter(cell=>cell.colSpan>1||cell.rowSpan>1).length,
      assignedTextItems:new Set([...mapped.values()].flat()).size }
  })
  for (const [gridIndex, candidate] of retained.entries()) {
    const cells = candidate.cells ?? extractCells(candidate, horizontals, verticals)
    const inside = items.filter(item => item.x + item.w/2 >= candidate.bbox.x1 && item.x + item.w/2 <= candidate.bbox.x2 && item.y + item.h/2 >= candidate.bbox.y1 && item.y + item.h/2 <= candidate.bbox.y2)
    for (const [cell, texts] of mapTextToCells(inside, cells)) for (const text of texts) owners.set(text, { gridIndex, row:cell.row, col:cell.col })
  }
  for (const item of items) affiliations.push({ text:item.text, x:round(item.x), y:round(item.y), owner:owners.get(item) ?? null })
  const irTables = parsed.blocks.filter(block => block.type === "table" && block.table && block.pageNumber === pageNumber)
    .map(block => ({ rows:block.table.rows, cols:block.table.cols, bbox:block.bbox, firstCell:block.table.cells[0]?.[0]?.text ?? "" }))
  const trace = {
    page:pageNumber, pdf_sha256:hash, pageSize:{width:round(width),height:round(height)}, rotation:page.rotate,
    cropOrigin:{x:originX,y:originY}, raw,
    clipStages:{initial:clipGrids.map(grid), afterShading:afterShading.map(grid), afterInset:afterInset.map(grid), afterHead:afterHead.map(grid), retained:tableClipGrids.map(grid)},
    processed:{horizontals:horizontals.map(line),verticals:verticals.map(line),underlinesRemoved:underlines.size},
    lineGrids:lineGrids.map(grid), candidateLineGrids, lineAfterClip:lineAfterClip.map(grid),
    clipContainers:clipResult.containers.map(item => ({x1:round(item.x1),y1:round(item.y1),x2:round(item.x2),y2:round(item.y2)})),
    retainedGrids:retained.map(grid),
    textAffiliations:affiliations,
    irTables,
    counts:{textItems:items.length, affiliated:affiliations.filter(item => item.owner).length,
      rawH:raw.horizontals.length,rawV:raw.verticals.length,rawClips:raw.clips,
      processedH:horizontals.length,processedV:verticals.length,lineGrids:lineGrids.length,
      clipGrids:clipGrids.length,clipContainers:clipResult.containers.length,
      lineAfterClip:lineAfterClip.length,lineAfterContainer:lineAfterContainer.length,
      retainedGrids:retained.length,irTables:irTables.length},
  }
  pages.push(trace)
  const elements = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}">`,
    `<rect width="100%" height="100%" fill="white"/>`,
    ...horizontals.map(item => svgLine(item,height,"#a4b8ca",0.45,0.6)),
    ...verticals.map(item => svgLine(item,height,"#a4b8ca",0.45,0.6)),
    ...clipGrids.map(item => svgBox(item.bbox,height,"#b65dcf",0.45,1.3)),
    ...lineGrids.map(item => svgBox(item.bbox,height,"#2d8b59",0.5,1.2)),
    ...retained.map(item => svgBox(item.bbox,height,"#d04731",0.9,1.6)),
    ...affiliations.map(item => `<circle cx="${item.x}" cy="${round(height-item.y)}" r="${item.owner ? 0.8 : 1.4}" fill="${item.owner ? "#113e75" : "#e45826"}"/>`),
    `<g font-family="sans-serif" font-size="8" fill="#172637"><text x="8" y="14">Page ${pageNumber} • blue=lines • purple=clip • green=line grid • red=retained grid • orange=unassigned text</text><text x="8" y="25">${escape(JSON.stringify(trace.counts))}</text></g>`,
    `</svg>`,
  ]
  await writeFile(join(outDir, `page-${String(pageNumber).padStart(2,"0")}.svg`), elements.join("\n"))
  await writeFile(join(outDir, `page-${String(pageNumber).padStart(2,"0")}.json`), JSON.stringify(trace,null,2)+"\n")
  console.error(`page ${pageNumber}: ${JSON.stringify(trace.counts)}`)
  page.cleanup()
}
await writeFile(join(outDir,"summary.json"),JSON.stringify({pdf_sha256:hash,pages:pages.map(({page,counts,irTables})=>({page,counts,irTables}))},null,2)+"\n")
await doc.destroy()
console.log(join(outDir,"summary.json"))
