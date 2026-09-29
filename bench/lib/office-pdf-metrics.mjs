/** Deterministic, format-specific comparison of source facts with parsed IR. */
import { normalizeUnit, scoreUnits } from "./office-pdf-gold.mjs"

const cellKey = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()

export function scoreCellValues(sourceSheets, blocks) {
  const count = values => {
    const map = new Map()
    for (const value of values) {
      const key = cellKey(value)
      if (key) map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }
  const byType = {}
  const missing = []
  let sourceCount = 0, leadingZeroSource = 0, leadingZeroExact = 0
  for (const sheet of sourceSheets) {
    const source = sheet.cells.filter(cell => cell.value !== "" && cell.type !== "error")
    const output = blocks.filter(block => block.type === "table" && block.table && block.pageNumber === sheet.number)
      .flatMap(block => block.table.cells.flat().map(cell => cell.text))
    const outputCounts = count(output)
    const leadingZeroOutput = count(output)
    sourceCount += source.length
    for (const cell of source) {
      const group = byType[cell.type] ??= { source: 0, exactVisible: 0 }
      group.source++
      const key = cellKey(cell.value)
      if (outputCounts.get(key) > 0) {
        outputCounts.set(key, outputCounts.get(key) - 1)
        group.exactVisible++
      } else if (missing.length < 12) {
        missing.push({ sheet: sheet.name, address: cell.address, type: cell.type, value: cell.value })
      }
      if (cell.type === "string" && /^0\d+$/.test(cell.value)) {
        leadingZeroSource++
        if (leadingZeroOutput.get(key) > 0) {
          leadingZeroOutput.set(key, leadingZeroOutput.get(key) - 1)
          leadingZeroExact++
        }
      }
    }
  }
  const exact = Object.values(byType).reduce((n, group) => n + group.exactVisible, 0)
  return {
    sourceCells: sourceCount,
    exactVisibleCells: exact,
    exactVisibleRecall: sourceCount ? exact / sourceCount : 1,
    bySourceType: byType,
    outputTypeMetadataAvailable: false,
    leadingZero: { source: leadingZeroSource, exactVisible: leadingZeroExact },
    missingExamples: missing,
  }
}

export function scoreMerges(sourceSheets, blocks) {
  const source = sourceSheets.reduce((n, sheet) => n + sheet.merges.length, 0)
  const parsed = blocks.filter(block => block.type === "table" && block.table)
    .flatMap(block => block.table.cells.flat())
    .filter(cell => cell.rowSpan > 1 || cell.colSpan > 1).length
  return { sourceRanges: source, outputSpans: parsed, addressAligned: null }
}

export function scoreTableShapes(expected, blocks) {
  const tables = blocks.filter(block => block.type === "table" && block.table)
  const checks = (expected ?? []).map(shape => ({
    ...shape,
    found: tables.some(block => block.pageNumber === shape.page && block.table.rows === shape.rows && block.table.cols === shape.cols),
  }))
  return { expected: checks.length, exact: checks.filter(item => item.found).length, checks }
}

export function scoreHeadingOrder(expected, blocks) {
  const headings = blocks.filter(block => block.type === "heading")
  let cursor = 0
  const checks = (expected ?? []).map(item => {
    const at = headings.findIndex((heading, index) => index >= cursor &&
      normalizeUnit(heading.text).includes(normalizeUnit(item.text)) && heading.level === item.level)
    if (at >= 0) cursor = at + 1
    return { ...item, foundInOrder: at >= 0 }
  })
  return { expected: checks.length, exactOrdered: checks.filter(item => item.foundInOrder).length, checks }
}

export function scoreTextUnits(sourceUnits, markdown) {
  return scoreUnits(sourceUnits.filter(unit => normalizeUnit(unit).length >= 2), markdown)
}
