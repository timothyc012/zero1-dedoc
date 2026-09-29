import type { Box } from "./crop.js"
import type { OcrItem, OcrTuning } from "./engine.js"

export interface DetectionTile {
  x: number
  y: number
  width: number
  height: number
}

export interface TileDetections {
  tile: DetectionTile
  boxes: Box[]
}

/** Preserve page context while raising DBNet's input resolution on large scans. */
export function detectionTuningForImage<T extends Pick<OcrTuning, "detLongSide">>(
  width: number,
  height: number,
  tuning: T,
): T {
  const pageLongSide = Math.max(width, height)
  if (pageLongSide <= tuning.detLongSide * 1.5) return tuning
  const target = Math.min(pageLongSide, tuning.detLongSide * 2)
  const rounded = Math.round(target / 32) * 32
  return { ...tuning, detLongSide: Math.min(pageLongSide, rounded) } as T
}

export function ocrTuningForImage<T extends Pick<OcrTuning, "detLongSide" | "textScore">>(
  width: number,
  height: number,
  tuning: T,
): T {
  const detected = detectionTuningForImage(width, height, tuning)
  if (detected === tuning) return tuning
  // Small print and display lettering often have lower CTC confidence than
  // body text. Keep those candidates on large scans so layout-aware parsing
  // can use their positions; OCR_LOW_CONF still reports the rejected tail.
  return { ...detected, textScore: Math.min(tuning.textScore, 0.25) } as T
}

/** Keep one coherent row from whichever scale recognized more usable text. */
export function mergeOcrPasses(primary: OcrItem[], detail: OcrItem[]): OcrItem[] {
  const baseRows = groupOcrLines(primary)
  const detailRows = groupOcrLines(detail)
  const selected = new Map<number, OcrLineGroup>()
  const consumedDetail = new Set<number>()

  for (let baseIndex = 0; baseIndex < baseRows.length; baseIndex++) {
    const base = baseRows[baseIndex]
    const matches = detailRows
      .map((row, index) => ({ row, index, overlap: rowOverlap(base, row) }))
      .filter(match => match.overlap > 0 && !consumedDetail.has(match.index))
      .sort((a, b) => b.overlap - a.overlap)
    const best = matches[0]
    if (!best) {
      selected.set(baseIndex, base)
      continue
    }
    consumedDetail.add(best.index)
    selected.set(baseIndex, rowScore(best.row) > rowScore(base) + 0.25 ? best.row : base)
  }

  const output = [...selected.values()].map(coalesceOcrRow)
  detailRows.forEach((row, index) => { if (!consumedDetail.has(index)) output.push(coalesceOcrRow(row)) })
  return deduplicateOcrItems(output)
}

function coalesceOcrRow(row: OcrLineGroup): OcrItem {
  const items = [...row.items].sort((a, b) => a.x - b.x)
  if (items.length === 1) return items[0]
  const textLength = (item: OcrItem) => [...item.text].length
  const chars = items.reduce((sum, item) => sum + textLength(item), 0)
  const confidence = items.reduce((sum, item) => sum + item.confidence * textLength(item), 0) / Math.max(1, chars)
  const x = Math.min(...items.map(item => item.x))
  const y = Math.min(...items.map(item => item.y))
  return {
    text: items.map(item => item.text.trim()).filter(Boolean).join(" "),
    x,
    y,
    w: Math.max(...items.map(item => item.x + item.w)) - x,
    h: Math.max(...items.map(item => item.y + item.h)) - y,
    confidence,
  }
}

function deduplicateOcrItems(items: OcrItem[]): OcrItem[] {
  const output: OcrItem[] = []
  const normalized = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const text = normalized(item.text)
    const duplicateIndex = output.findIndex(candidate => {
      const other = normalized(candidate.text)
      if (!text || !other || (text !== other && text.length < 3 && other.length < 3)) return false
      if (text !== other && !text.includes(other) && !other.includes(text)) return false
      const width = Math.min(item.w, candidate.w)
      const height = Math.min(item.h, candidate.h)
      const overlapX = Math.max(0, Math.min(item.x + item.w, candidate.x + candidate.w) - Math.max(item.x, candidate.x))
      const overlapY = Math.max(0, Math.min(item.y + item.h, candidate.y + candidate.h) - Math.max(item.y, candidate.y))
      return overlapX / Math.max(1, width) >= 0.75 && overlapY / Math.max(1, height) >= 0.5
    })
    if (duplicateIndex < 0) {
      output.push(item)
      continue
    }
    const prior = output[duplicateIndex]
    const priorText = normalized(prior.text)
    const replace = text.length > priorText.length ||
      (text.length === priorText.length && item.confidence > prior.confidence)
    if (replace) output[duplicateIndex] = item
  }
  return output.sort((a, b) => a.y - b.y || a.x - b.x)
}

interface OcrLineGroup {
  items: OcrItem[]
  x1: number
  x2: number
  centerY: number
  medianHeight: number
}

function groupOcrLines(items: OcrItem[]): OcrLineGroup[] {
  const sorted = [...items].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x)
  const parent = sorted.map((_, index) => index)
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]]
      index = parent[index]
    }
    return index
  }

  // Join pairs first, then form components. Greedily growing a row's bounding
  // box was order-dependent: a long right-hand box could absorb the middle
  // fragment before the left-hand fragment got a chance to join the same line.
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    const centerA = a.y + a.h / 2
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      const centerB = b.y + b.h / 2
      const height = Math.min(a.h, b.h)
      if (centerB - centerA > Math.max(4, a.h * 0.65)) break
      if (Math.max(a.h, b.h) / Math.max(1, height) > 2.5) continue
      const verticalOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      const shortSuperscript = Math.max(a.h, b.h) / Math.max(1, height) >= 1.5 &&
        ([...a.text].length <= 3 || [...b.text].length <= 3) &&
        verticalOverlap / Math.max(1, height) >= 0.5
      if (Math.abs(centerA - centerB) > Math.max(4, height * 0.42) && !shortSuperscript) continue
      const xGap = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w))
      if (xGap > Math.max(3, height * 0.75)) continue
      const rootA = find(i), rootB = find(j)
      if (rootA !== rootB) parent[rootB] = rootA
    }
  }

  const groups = new Map<number, OcrItem[]>()
  sorted.forEach((item, index) => {
    const root = find(index)
    const group = groups.get(root) ?? []
    group.push(item)
    groups.set(root, group)
  })
  return [...groups.values()].map(rowItems => {
    const heights = rowItems.map(item => item.h).sort((a, b) => a - b)
    const centers = rowItems.map(item => item.y + item.h / 2).sort((a, b) => a - b)
    return {
      items: rowItems.sort((a, b) => a.x - b.x),
      x1: Math.min(...rowItems.map(item => item.x)),
      x2: Math.max(...rowItems.map(item => item.x + item.w)),
      centerY: centers[centers.length >> 1],
      medianHeight: heights[heights.length >> 1],
    }
  })
}

function rowOverlap(a: OcrLineGroup, b: OcrLineGroup): number {
  const height = Math.min(a.medianHeight, b.medianHeight)
  if (Math.max(a.medianHeight, b.medianHeight) / Math.max(1, height) > 2.5) return 0
  if (Math.abs(a.centerY - b.centerY) > Math.max(4, height * 0.65)) return 0
  const overlap = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1))
  const width = Math.min(a.x2 - a.x1, b.x2 - b.x1)
  const gap = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2))
  if (overlap / Math.max(1, width) < 0.15 && gap > height * 1.5) return 0
  return overlap / Math.max(1, width)
}

function rowScore(row: OcrLineGroup): number {
  const length = (item: OcrItem) => [...item.text].length
  const count = row.items.reduce((sum, item) => sum + length(item), 0)
  const confidence = row.items.reduce((sum, item) => sum + item.confidence * length(item), 0) / Math.max(1, count)
  const visible = row.items.reduce((sum, item) => sum + [...item.text].filter(char => /[\p{L}\p{N}]/u.test(char)).length, 0)
  const text = row.items.map(item => item.text).join(" ")
  const hasPrice = /\b\d+[.,]\d{2}\b/u.test(text)
  // For a line seen by both detector scales, a modest CTC-confidence gain is
  // useful evidence when the higher-resolution pass split the line into more
  // coherent fragments. A complete decimal price is also stronger evidence
  // than a partial digit crop, even if the partial crop has higher confidence.
  // One confidence point is worth about 1/60 of a glyph.
  return visible + confidence * 60 + (hasPrice ? 8 : 0)
}

/**
 * Plan overlapping source-resolution regions for DB text detection.
 * The recognizer still reads crops from the original page raster, so its
 * 48-pixel line normalization and global PDF coordinates remain unchanged.
 */
export function planDetectionTiles(
  width: number,
  height: number,
  detectorLongSide: number,
  tileLongSide = Math.max(detectorLongSide, Math.round(detectorLongSide * 4 / 3)),
  overlap = Math.round(tileLongSide * 0.18),
): DetectionTile[] {
  if (width <= 0 || height <= 0) return []
  if (Math.max(width, height) <= detectorLongSide * 1.5) {
    return [{ x: 0, y: 0, width, height }]
  }
  const xs = tileStarts(width, tileLongSide, overlap)
  const ys = tileStarts(height, tileLongSide, overlap)
  return ys.flatMap(y => xs.map(x => ({
    x,
    y,
    width: Math.min(tileLongSide, width - x),
    height: Math.min(tileLongSide, height - y),
  })))
}

function tileStarts(length: number, tileSize: number, overlap: number): number[] {
  if (length <= tileSize) return [0]
  const stride = Math.max(1, tileSize - overlap)
  const count = Math.ceil((length - overlap) / stride)
  const last = length - tileSize
  return Array.from({ length: count }, (_, index) => Math.round(last * index / (count - 1)))
}

export function cropRgba(rgba: Uint8Array, pageWidth: number, tile: DetectionTile): Uint8Array {
  const out = new Uint8Array(tile.width * tile.height * 4)
  for (let y = 0; y < tile.height; y++) {
    const start = ((tile.y + y) * pageWidth + tile.x) * 4
    out.set(rgba.subarray(start, start + tile.width * 4), y * tile.width * 4)
  }
  return out
}

/** Map tile-local boxes into page coordinates and collapse boxes repeated in the overlap. */
export function mergeDetectionTiles(detections: TileDetections[]): Box[] {
  const output: Array<{ box: Box; tiles: Set<number>; tile: DetectionTile }> = []
  for (let tileIndex = 0; tileIndex < detections.length; tileIndex++) {
    const { tile, boxes } = detections[tileIndex]
    for (const local of boxes) {
      let box = { ...local, x: local.x + tile.x, y: local.y + tile.y }
      const matched = new Set<number>()
      let alreadyCoveredByCoarse = false
      for (let i = 0; i < output.length; i++) {
        const candidate = output[i]
        if ([...candidate.tiles].some(index => index === tileIndex)) continue
        if (sameDetectedLine(box, candidate.box)) {
          // The whole-page pass owns a line when it already detected it.
          // Tile DBNet can split that line into smaller boxes; feeding both
          // boxes to the recognizer duplicated words (e.g. `Über 170` twice).
          if (candidate.tiles.has(0)) {
            alreadyCoveredByCoarse = true
            break
          }
          box = union(box, candidate.box)
          matched.add(i)
          continue
        }
        if (!joinsAcrossTileEdge(local, tile, candidate.box, candidate.tile)) continue
        box = union(box, candidate.box)
        matched.add(i)
      }
      if (alreadyCoveredByCoarse) continue
      if (matched.size === 0) {
        output.push({ box, tiles: new Set([tileIndex]), tile })
      } else {
        const first = Math.min(...matched)
        const mergedTiles = new Set([tileIndex])
        for (const index of matched) {
          for (const tileId of output[index].tiles) mergedTiles.add(tileId)
        }
        output[first] = { box, tiles: mergedTiles, tile: output[first].tile }
        for (const index of [...matched].sort((a, b) => b - a)) {
          if (index !== first) output.splice(index, 1)
        }
      }
    }
  }
  return output.map(item => item.box).sort((a, b) => a.y - b.y || a.x - b.x)
}

function sameDetectedLine(a: Box, b: Box): boolean {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  if (ix === 0 || iy === 0) return false
  const minArea = Math.min(a.w * a.h, b.w * b.h)
  const verticalMatch = iy / Math.min(a.h, b.h) >= 0.65 &&
    Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) <= Math.max(a.h, b.h) * 0.35
  const containedSameLine = verticalMatch && Math.max(a.h, b.h) / Math.max(1, Math.min(a.h, b.h)) <= 1.8 &&
    (containsWithMargin(a, b, 5) || containsWithMargin(b, a, 5))
  const partialSameLine = verticalMatch && ix / Math.min(a.w, b.w) >= 0.2 && ix * iy / minArea >= 0.2
  return containedSameLine || partialSameLine
}

function containsWithMargin(outer: Box, inner: Box, margin: number): boolean {
  return outer.x <= inner.x + margin && outer.y <= inner.y + margin &&
    outer.x + outer.w >= inner.x + inner.w - margin &&
    outer.y + outer.h >= inner.y + inner.h - margin
}

function joinsAcrossTileEdge(local: Box, tile: DetectionTile, pageBox: Box, otherTile: DetectionTile): boolean {
  const pageLocal = { ...pageBox, x: pageBox.x - otherTile.x, y: pageBox.y - otherTile.y }
  const verticalOverlap = Math.max(0,
    Math.min(local.y + local.h, pageLocal.y + pageLocal.h) - Math.max(local.y, pageLocal.y))
  const horizontalOverlap = Math.max(0,
    Math.min(local.x + local.w, pageLocal.x + pageLocal.w) - Math.max(local.x, pageLocal.x))
  const yRatio = verticalOverlap / Math.max(1, Math.min(local.h, pageLocal.h))
  const xRatio = horizontalOverlap / Math.max(1, Math.min(local.w, pageLocal.w))
  const margin = Math.max(4, Math.round(Math.min(tile.width, tile.height) * 0.008))
  const touchesOpposingXEdges =
    (tile.x < otherTile.x && local.x + local.w >= tile.width - margin && pageLocal.x <= margin) ||
    (otherTile.x < tile.x && pageLocal.x + pageLocal.w >= otherTile.width - margin && local.x <= margin)
  const touchesOpposingYEdges =
    (tile.y < otherTile.y && local.y + local.h >= tile.height - margin && pageLocal.y <= margin) ||
    (otherTile.y < tile.y && pageLocal.y + pageLocal.h >= otherTile.height - margin && local.y <= margin)
  return (touchesOpposingXEdges && yRatio >= 0.65 &&
      Math.abs((local.y + local.h / 2) - (pageLocal.y + pageLocal.h / 2)) <= Math.max(local.h, pageLocal.h) * 0.6) ||
    (touchesOpposingYEdges && xRatio >= 0.65 &&
      Math.abs((local.x + local.w / 2) - (pageLocal.x + pageLocal.w / 2)) <= Math.max(local.w, pageLocal.w) * 0.08)
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}
