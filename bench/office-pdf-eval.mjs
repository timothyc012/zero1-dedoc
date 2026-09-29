#!/usr/bin/env node
/** Re-run the hash-pinned Office/PDF development corpus, with source-side gold. */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { docxParagraphs, pptxParagraphs, xlsxSourceCells } from "./lib/office-pdf-gold.mjs"
import { scoreCellValues, scoreHeadingOrder, scoreMerges, scoreTableShapes, scoreTextUnits } from "./lib/office-pdf-metrics.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifestPath = join(root, "bench/office-pdf-manifest.json")
const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
const args = process.argv.slice(2)
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const corpus = resolve(option("--corpus") ?? join(root, "bench/corpus/office-pdf"))
const out = resolve(option("--out") ?? join(root, "bench/office-pdf-results.json"))
const fetchMissing = args.includes("--fetch")
const recordBaseline = args.includes("--record-baseline")
const gate = args.includes("--gate")
if (recordBaseline && gate) throw new Error("Choose one of --record-baseline or --gate")
if (args.includes("--help")) {
  console.log("Usage: npm run bench:office-pdf -- [--corpus DIR] [--fetch] [--out FILE] [--gate|--record-baseline]")
  process.exit(0)
}

const sha256 = value => createHash("sha256").update(value).digest("hex")
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
const evaluatorHash = sha256(Buffer.concat(await Promise.all([
  "bench/office-pdf-eval.mjs", "bench/lib/office-pdf-gold.mjs", "bench/lib/office-pdf-metrics.mjs",
].map(async path => readFile(join(root, path))))))
const manifestHash = sha256(await readFile(manifestPath))

async function sourceBytes(doc) {
  const path = doc.bundled ? join(root, doc.bundled) : join(corpus, doc.filename)
  let bytes
  try { bytes = await readFile(path) } catch (error) {
    if (!fetchMissing || doc.bundled || !doc.source.url) throw new Error(`Missing input ${doc.id}: ${path}; use --fetch or provide --corpus`, { cause: error })
    const response = await fetch(doc.source.url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`Source download failed ${doc.id}: HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    if (sha256(bytes) !== doc.sha256) throw new Error(`Source hash mismatch ${doc.id}; downloaded file was not saved`)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
  }
  if (sha256(bytes) !== doc.sha256) throw new Error(`Source hash mismatch ${doc.id}: ${path}`)
  return bytes
}

function xlsPairedGold(doc, allDocuments) {
  const pair = allDocuments.find(item => item.id === "test.xlsx")
  if (!pair) throw new Error(`Missing XLS paired gold for ${doc.id}`)
  return pair
}

function scanState(result, doc) {
  const codes = result.warnings?.map(warning => warning.code) ?? []
  const needsOcr = result.qualitySummary?.needsOcr === true || codes.includes("NEEDS_OCR")
  const ocrApplied = codes.includes("OCR_APPLIED")
  return {
    expectedRequired: doc.expected?.requires_ocr ?? null,
    configured: manifest.options.ocr,
    detectedNeed: needsOcr,
    applied: ocrApplied,
    emptyText: (result.qualitySummary?.totalTextChars ?? 0) === 0,
    appropriatelyFlagged: doc.expected?.requires_ocr ? needsOcr && !ocrApplied : null,
  }
}

function pdfMetrics(doc, result, sealedGold) {
  const expected = doc.expected ?? {}
  const formCounts = Object.fromEntries((expected.form_ids ?? []).map(id => [id,
    result.markdown.split(id).length - 1,
  ]))
  const output = {
    pages: { expected: expected.page_count ?? null, actual: result.metadata?.pageCount ?? null },
    headings: scoreHeadingOrder(expected.heading_order, result.blocks),
    tableShapes: scoreTableShapes(expected.table_shapes ?? (expected.table_shape?.rows ? [expected.table_shape] : []), result.blocks),
    formIds: {
      expected: expected.form_ids ?? [],
      found: (expected.form_ids ?? []).filter(id => formCounts[id] > 0),
      exactOnce: (expected.form_ids ?? []).filter(id => formCounts[id] === 1),
      occurrences: formCounts,
    },
    ocr: scanState(result, doc),
  }
  if (expected.table_shape && !expected.table_shape.rows) {
    output.tableColumnCheck = {
      expectedPage: expected.table_shape.page, expectedCols: expected.table_shape.cols,
      found: result.blocks.some(block => block.type === "table" && block.pageNumber === expected.table_shape.page && block.table?.cols === expected.table_shape.cols),
    }
  }
  const fixture = sealedGold.documents.find(item => item.filename === doc.filename)
  if (fixture) output.topicIds = {
    expected: fixture.topics.map(item => item.topic_id),
    found: fixture.topics.filter(item => result.markdown.includes(item.topic_id)).map(item => item.topic_id),
  }
  return output
}

const sealedGold = JSON.parse(await readFile(join(root, "bench/fixtures/office-pdf/sealed-gold.json"), "utf8"))
const documents = []
for (const doc of manifest.documents) {
  const bytes = await sourceBytes(doc)
  const start = performance.now()
  let result
  try { result = await parse(bytes, { ...manifest.options, filename: doc.filename }) }
  catch (error) { result = { success: false, error: error instanceof Error ? error.message : String(error) } }
  const record = {
    id: doc.id, format: doc.format, sha256: doc.sha256,
    support: { parsed: result.success, error: result.success ? null : result.error },
    elapsedMs: Math.round(performance.now() - start),
  }
  if (result.success) {
    record.warnings = (result.warnings ?? []).map(item => item.code)
    if (doc.format === "docx") {
      const source = await docxParagraphs(bytes)
      record.quality = { text: scoreTextUnits(source, result.markdown) }
      if (doc.expected?.inline_math_order) record.quality.inlineMath = {
        expected: doc.expected.inline_math_order,
        exactSequencePresent: result.markdown.includes(doc.expected.inline_math_order),
      }
    } else if (doc.format === "xlsx" || doc.format === "xls") {
      const source = await xlsxSourceCells(doc.format === "xls" ? await sourceBytes(xlsPairedGold(doc, manifest.documents)) : bytes)
      record.quality = {
        sourceGold: doc.format === "xls" ? "paired-test.xlsx" : "native-xlsx",
        cells: scoreCellValues(source, result.blocks),
        merges: scoreMerges(source, result.blocks),
      }
      if (doc.expected?.string_codes) record.quality.codeChecks = Object.fromEntries(
        Object.entries(doc.expected.string_codes).map(([value, count]) => [value, {
          expected: count,
          found: result.blocks.filter(block => block.type === "table" && block.table)
            .flatMap(block => block.table.cells.flat()).filter(cell => cell.text === value).length,
        }]),
      )
    } else if (doc.format === "pptx") {
      const slides = await pptxParagraphs(bytes)
      const source = slides.flatMap(slide => slide.paragraphs)
      record.quality = {
        slideCount: { expected: slides.length, actual: result.metadata?.pageCount ?? null },
        text: scoreTextUnits(source, result.markdown),
      }
    } else if (doc.format === "pdf") record.quality = pdfMetrics(doc, result, sealedGold)
  }
  documents.push(record)
  console.error(`${doc.id}: ${record.support.parsed ? "parsed" : "unsupported"} (${record.elapsedMs} ms)`)
}

const evaluation = {
  schema_version: "zero1-office-pdf-result.v1",
  manifest_sha256: manifestHash,
  evaluator_sha256: evaluatorHash,
  parser_revision: sourceRevision,
  parser_package_version: manifest.parser_package_version,
  options: manifest.options,
  corpus_role: manifest.corpus_role,
  summary: {
    documents: documents.length,
    supported: documents.filter(item => item.support.parsed).length,
    formats: Object.fromEntries([...new Set(documents.map(item => item.format))].map(format => [format, documents.filter(item => item.format === format).length])),
  },
  documents,
}

function metricVector(record) {
  if (!record.support.parsed) return { supported: 0 }
  const q = record.quality
  const vector = { supported: 1 }
  if (q.text) {
    vector.textPresence = q.text.exactUnitRecallWeighted
    vector.textOrder = q.text.orderedUnits
  }
  if (q.inlineMath) vector.inlineMath = Number(q.inlineMath.exactSequencePresent)
  if (q.cells) {
    vector.exactCells = q.cells.exactVisibleCells
    vector.leadingZero = q.cells.leadingZero.exactVisible
  }
  if (q.headings) vector.headingOrder = q.headings.exactOrdered
  if (q.tableShapes) vector.tableShape = q.tableShapes.exact
  if (q.formIds) vector.formIds = q.formIds.exactOnce.length
  if (q.topicIds) vector.topicIds = q.topicIds.found.length
  if (q.ocr?.expectedRequired) vector.ocrNeedFlag = Number(q.ocr.appropriatelyFlagged)
  if (q.pages?.expected != null) vector.pageCount = Number(q.pages.actual === q.pages.expected)
  if (q.slideCount) vector.slideCount = Number(q.slideCount.actual === q.slideCount.expected)
  if (q.tableColumnCheck) vector.tableColumn = Number(q.tableColumnCheck.found)
  return vector
}

if (gate) {
  const baseline = JSON.parse(await readFile(join(root, manifest.baseline_result), "utf8"))
  if (baseline.manifest_sha256 !== manifestHash || baseline.evaluator_sha256 !== evaluatorHash) {
    throw new Error("Evaluator or manifest changed; record the reason and old/new scores before replacing the baseline")
  }
  const regressions = []
  for (const current of documents) {
    const previous = baseline.documents.find(item => item.id === current.id)
    if (!previous) throw new Error(`Baseline missing ${current.id}`)
    const before = metricVector(previous), after = metricVector(current)
    for (const [metric, value] of Object.entries(before)) {
      if (after[metric] === undefined || after[metric] + 1e-9 < value) regressions.push({ id: current.id, metric, before: value, after: after[metric] ?? null })
    }
  }
  evaluation.gate = { baseline_parser_revision: baseline.parser_revision, regressions, passed: regressions.length === 0 }
}
await mkdir(dirname(out), { recursive: true })
await writeFile(out, JSON.stringify(evaluation, null, 2) + "\n")
if (recordBaseline) {
  if (sourceRevision !== manifest.approved_parser_baseline_commit) throw new Error("Baseline may only be recorded on the approved parser revision")
  await writeFile(join(root, manifest.baseline_result), JSON.stringify(evaluation, null, 2) + "\n")
}
console.log(JSON.stringify({ output: out, summary: evaluation.summary, gate: evaluation.gate ?? null }))
if (evaluation.gate && !evaluation.gate.passed) process.exitCode = 1
