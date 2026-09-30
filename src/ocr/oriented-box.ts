import type { Box, Point } from "./crop.js"

interface OrientedBounds {
  cos: number
  sin: number
  left: number
  right: number
  top: number
  bottom: number
  area: number
}

// Exact hull-edge search for ordinary text contours. Dense curved contours
// use uniformly sampled edge angles to bound the rectangle search cost.
const MAX_RECTANGLE_ANGLES = 256

/** DB text-map components -> minimum-area oriented rectangles. The hull needs
 * only each component's left/right extremes per row, so boundary storage is
 * bounded by twice the map height even for a large irregular component.
 */
export function orientedComponentBoxes(
  probability: Float32Array,
  width: number,
  height: number,
  threshold: number,
  boxThreshold: number,
  unclip: number,
): Box[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      probability.length !== width * height) throw new Error("Invalid OCR probability-map dimensions")

  const visited = new Uint8Array(width * height)
  const stack: number[] = []
  const output: Box[] = []
  for (let start = 0; start < probability.length; start++) {
    if (visited[start] || !(probability[start] > threshold)) continue
    stack.push(start)
    visited[start] = 1
    const rows = new Map<number, { left: number; right: number }>()
    let sum = 0
    let count = 0
    while (stack.length) {
      const index = stack.pop()!
      const x = index % width
      const y = Math.floor(index / width)
      sum += probability[index]
      count++
      const row = rows.get(y)
      if (row) { row.left = Math.min(row.left, x); row.right = Math.max(row.right, x) }
      else rows.set(y, { left: x, right: x })
      const neighbors = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] || !(probability[neighbor] > threshold)) continue
        visited[neighbor] = 1
        stack.push(neighbor)
      }
    }
    if (sum / count < boxThreshold || count < 3) continue
    const extremes = [...rows].flatMap(([y, row]) => [{ x: row.left, y }, { x: row.right, y }])
    const hull = convexHull(extremes)
    if (hull.length < 3) continue
    const bounds = minimumRectangle(hull)
    if (!bounds) continue
    const boxWidth = bounds.right - bounds.left + 1
    const boxHeight = bounds.bottom - bounds.top + 1
    if (boxWidth < 3 || boxHeight < 3) continue
    // DB training shrinks text polygons. Expand the rectangle using its
    // area/perimeter ratio; this retains the existing unclip approximation.
    const padding = boxWidth * boxHeight * unclip / (2 * (boxWidth + boxHeight))
    const toPage = (x: number, y: number): Point => ({
      x: x * bounds.cos - y * bounds.sin,
      y: x * bounds.sin + y * bounds.cos,
    })
    const quad: [Point, Point, Point, Point] = [
      toPage(bounds.left - padding, bounds.top - padding),
      toPage(bounds.right + 1 + padding, bounds.top - padding),
      toPage(bounds.right + 1 + padding, bounds.bottom + 1 + padding),
      toPage(bounds.left - padding, bounds.bottom + 1 + padding),
    ]
    const x = Math.max(0, Math.floor(Math.min(...quad.map(point => point.x))))
    const y = Math.max(0, Math.floor(Math.min(...quad.map(point => point.y))))
    const right = Math.min(width, Math.ceil(Math.max(...quad.map(point => point.x))))
    const bottom = Math.min(height, Math.ceil(Math.max(...quad.map(point => point.y))))
    if (right - x >= 3 && bottom - y >= 3) output.push({ x, y, w: right - x, h: bottom - y, quad })
  }
  return output.sort((a, b) => a.y - b.y || a.x - b.x)
}

function minimumRectangle(hull: Point[]): OrientedBounds | undefined {
  let best: OrientedBounds | undefined
  const candidates = Math.min(hull.length, MAX_RECTANGLE_ANGLES)
  for (let sample = 0; sample < candidates; sample++) {
    const index = Math.floor(sample * hull.length / candidates)
    const a = hull[index]
    const b = hull[(index + 1) % hull.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!length) continue
    let cos = (b.x - a.x) / length
    let sin = (b.y - a.y) / length
    // Keep the reading axis predominantly horizontal and pointing right.
    if (Math.abs(cos) < Math.abs(sin)) { const prior = cos; cos = sin; sin = -prior }
    if (cos < 0) { cos = -cos; sin = -sin }
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
    for (const point of hull) {
      const x = point.x * cos + point.y * sin
      const y = -point.x * sin + point.y * cos
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    const area = (right - left + 1) * (bottom - top + 1)
    if (!best || area < best.area) best = { cos, sin, left, right, top, bottom, area }
  }
  return best
}

function convexHull(points: Point[]): Point[] {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const half = (list: Point[]): Point[] => {
    const hull: Point[] = []
    for (const point of list) {
      while (hull.length > 1 && cross(hull.at(-2)!, hull.at(-1)!, point) <= 0) hull.pop()
      hull.push(point)
    }
    return hull
  }
  const lower = half(sorted), upper = half([...sorted].reverse())
  lower.pop(); upper.pop()
  return [...lower, ...upper]
}
