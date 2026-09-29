import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { detectionTuningForImage, mergeDetectionTiles, mergeOcrPasses, ocrTuningForImage, planDetectionTiles } from "../src/ocr/detection-tiles.js"

describe("OCR detection tiling", () => {
  it("raises DBNet input resolution for large pages while keeping small pages unchanged", () => {
    const base = { detLongSide: 960 }
    assert.equal(detectionTuningForImage(1105, 1400, base), base)
    assert.equal(detectionTuningForImage(1105, 1875, base).detLongSide, 1875)
    assert.equal(detectionTuningForImage(1800, 4200, base).detLongSide, 1920)
  })

  it("uses a lower CTC floor only on large scan rasters", () => {
    const base = { detLongSide: 960, textScore: 0.5 }
    assert.equal(ocrTuningForImage(1105, 1400, base), base)
    assert.deepEqual(ocrTuningForImage(1105, 1875, base), { detLongSide: 1875, textScore: 0.25 })
  })

  it("leaves pages within the detector scale as one tile", () => {
    assert.deepEqual(planDetectionTiles(1105, 1400, 960), [
      { x: 0, y: 0, width: 1105, height: 1400 },
    ])
  })

  it("covers a tall advertising page with overlapping full-width tiles", () => {
    const tiles = planDetectionTiles(1105, 1875, 960)
    assert.ok(tiles.length > 1)
    assert.ok(tiles.every(tile => tile.width === 1105 && tile.height <= 1280))
    const coveredY = tiles.flatMap(tile => [tile.y, tile.y + tile.height])
    assert.equal(Math.min(...coveredY), 0)
    assert.equal(Math.max(...coveredY), 1875)
    for (let y = 0; y < 1875; y += 32) {
      assert.ok(tiles.some(tile => tile.y <= y && tile.y + tile.height >= Math.min(1875, y + 1)), `uncovered y=${y}`)
    }
  })

  it("merges duplicate line boxes from overlap while preserving separate lines", () => {
    const tiles = [
      {
        tile: { x: 0, y: 0, width: 1105, height: 1280 },
        boxes: [
          { x: 100, y: 590, w: 280, h: 34 },
          { x: 100, y: 635, w: 280, h: 28 },
        ],
      },
      {
        tile: { x: 0, y: 595, width: 1105, height: 1280 },
        boxes: [
          { x: 101, y: 0, w: 279, h: 36 },
          { x: 100, y: 40, w: 280, h: 28 },
        ],
      },
    ]
    const boxes = mergeDetectionTiles(tiles)
    assert.equal(boxes.length, 2)
    assert.deepEqual(boxes[0], { x: 100, y: 590, w: 280, h: 34 })
    assert.deepEqual(boxes[1], { x: 100, y: 635, w: 280, h: 28 })
  })

  it("keeps the coarse line instead of emitting tile fragments, while retaining new text", () => {
    const boxes = mergeDetectionTiles([
      {
        tile: { x: 0, y: 0, width: 1105, height: 1875 },
        boxes: [{ x: 100, y: 590, w: 280, h: 34 }],
      },
      {
        tile: { x: 0, y: 595, width: 1105, height: 1280 },
        boxes: [
          { x: 102, y: 0, w: 132, h: 26 },
          { x: 500, y: 160, w: 250, h: 30 },
        ],
      },
    ])
    assert.equal(boxes.length, 2)
    assert.deepEqual(boxes[0], { x: 100, y: 590, w: 280, h: 34 })
    assert.deepEqual(boxes[1], { x: 500, y: 755, w: 250, h: 30 })
  })

  it("suppresses a partial box that overlaps the same coarse text line", () => {
    const boxes = mergeDetectionTiles([
      {
        tile: { x: 0, y: 0, width: 1105, height: 1875 },
        boxes: [{ x: 100, y: 590, w: 280, h: 34 }],
      },
      {
        tile: { x: 0, y: 595, width: 1105, height: 1280 },
        boxes: [{ x: 300, y: 0, w: 180, h: 30 }],
      },
    ])
    assert.equal(boxes.length, 1)
    assert.deepEqual(boxes[0], { x: 100, y: 590, w: 280, h: 34 })
  })

  it("selects one coherent OCR row and preserves a price recovered by the detail pass", () => {
    const merged = mergeOcrPasses([
      { text: "0", x: 100, y: 200, w: 40, h: 80, confidence: 0.82 },
      { text: "Über 170", x: 100, y: 80, w: 80, h: 20, confidence: 0.95 },
      { text: "Artikelmm)", x: 175, y: 82, w: 90, h: 19, confidence: 0.94 },
    ], [
      { text: "0.77", x: 100, y: 200, w: 100, h: 80, confidence: 0.7 },
      { text: "Über", x: 100, y: 80, w: 38, h: 20, confidence: 0.99 },
      { text: "170 Artikel' mm)", x: 142, y: 81, w: 122, h: 19, confidence: 0.99 },
      { text: "Eisbergsalat", x: 700, y: 200, w: 160, h: 30, confidence: 0.84 },
    ])
    assert.equal(merged.length, 3)
    assert.equal(merged[0].text, "Über 170 Artikel' mm)")
    assert.equal(merged[1].text, "0.77")
    assert.equal(merged[2].text, "Eisbergsalat")
  })

  it("merges multi-box lines independently of detector box ordering", () => {
    const merged = mergeOcrPasses([
      { text: "bis Fr. 2.10.", x: 734, y: 37, w: 335, h: 53, confidence: 0.999 },
      { text: "Ab", x: 331, y: 40, w: 83, h: 50, confidence: 0.999 },
      { text: "Mo. 28.9.", x: 436, y: 40, w: 304, h: 50, confidence: 0.999 },
    ], [
      { text: "Mo. 28.9. bis", x: 436, y: 37, w: 386, h: 53, confidence: 0.986 },
      { text: "Ab", x: 330, y: 40, w: 84, h: 50, confidence: 0.999 },
      { text: "Fr. 2.10.", x: 845, y: 41, w: 227, h: 49, confidence: 0.999 },
    ])

    assert.equal(merged.length, 1)
    assert.match(merged[0].text, /Ab.*Mo\. 28\.9\..*bis.*Fr\. 2\.10\./)
  })

  it("drops a duplicated word when line grouping differs between OCR scales", () => {
    const merged = mergeOcrPasses([
      { text: "Dienstleistung", x: 1125, y: 1068, w: 133, h: 27, confidence: 0.978 },
      { text: "GmbH & Co. KG", x: 1124, y: 1084, w: 137, h: 27, confidence: 0.981 },
    ], [
      { text: "Dienstleistung", x: 1125, y: 1068, w: 126, h: 26, confidence: 1 },
      { text: "GmbH & Co. KG", x: 1124, y: 1088, w: 137, h: 23, confidence: 0.963 },
    ])

    assert.equal(merged.length, 2)
    assert.equal(merged.filter(item => item.text === "Dienstleistung").length, 1)
    assert.equal(merged.filter(item => item.text === "GmbH & Co. KG").length, 1)
  })

  it("does not match adjacent tall display lines as the same OCR row", () => {
    const merged = mergeOcrPasses([
      { text: "Deutschlands", x: 137, y: 1236, w: 228, h: 59, confidence: 0.966 },
      { text: "günstigster", x: 105, y: 1270, w: 295, h: 87, confidence: 0.998 },
      { text: "Preis", x: 163, y: 1334, w: 203, h: 93, confidence: 0.999 },
    ], [
      { text: "Deutschlands", x: 141, y: 1236, w: 231, h: 59, confidence: 0.998 },
      { text: "günstigster", x: 112, y: 1269, w: 290, h: 87, confidence: 0.954 },
      { text: "Preis", x: 165, y: 1328, w: 198, h: 88, confidence: 0.999 },
    ])

    for (const text of ["Deutschlands", "günstigster", "Preis"]) {
      assert.equal(merged.filter(item => item.text === text).length, 1, `${text} should remain exactly once`)
    }
  })

  it("prefers the higher-confidence detailed reading of a German ad tagline", () => {
    const merged = mergeOcrPasses([
      { text: "Über 170", x: 225, y: 648, w: 265, h: 54, confidence: 0.999 },
      { text: "Artikelmm)", x: 454, y: 653, w: 256, h: 49, confidence: 0.946 },
    ], [
      { text: "Über", x: 225, y: 648, w: 129, h: 54, confidence: 0.999 },
      { text: "170 Artikel’", x: 368, y: 657, w: 298, h: 45, confidence: 0.990 },
      { text: "mm)", x: 658, y: 655, w: 52, h: 24, confidence: 0.999 },
    ])

    assert.ok(merged.some(item => item.text === "Über 170 Artikel’ mm)"))
    assert.ok(!merged.some(item => item.text === "Artikelmm)"))
  })
})
