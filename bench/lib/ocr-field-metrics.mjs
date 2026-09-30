/** Field-region OCR CER/WER with geometry-only matching to independent labels. */
export const normalizeOcrText = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim()

export function editDistance(a, b) {
  const left = Array.isArray(a) ? a : [...String(a)]
  const right = Array.isArray(b) ? b : [...String(b)]
  const row = new Uint32Array(right.length + 1)
  for (let j = 0; j <= right.length; j++) row[j] = j
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= right.length; j++) {
      const above = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + Number(left[i - 1] !== right[j - 1]))
      previous = above
    }
  }
  return row[right.length]
}

function geometryScore(item, box) {
  const [x1, y1, x2, y2] = box
  const overlap = Math.max(0, Math.min(item.x + item.w, x2) - Math.max(item.x, x1)) *
    Math.max(0, Math.min(item.y + item.h, y2) - Math.max(item.y, y1))
  const itemArea = Math.max(1, item.w * item.h)
  const fieldArea = Math.max(1, (x2 - x1) * (y2 - y1))
  // A field may contain several short OCR lines and a large amount of blank
  // space. Prefer how much of the recognized line lies inside the field;
  // use the field-area fraction only to break overlapping-box ties.
  return overlap / itemArea + 0.01 * overlap / fieldArea
}

export function scoreOcrFields(regions, ocrItems, minimumOverlap = 0.1) {
  const assigned = new Map(regions.map(region => [region.id, []]))
  let unassignedItems = 0
  for (const item of ocrItems) {
    let best = null, bestScore = minimumOverlap
    for (const region of regions) {
      const score = geometryScore(item, region.box)
      if (score > bestScore) { best = region; bestScore = score }
    }
    if (best) assigned.get(best.id).push(item)
    else unassignedItems++
  }
  const fields = regions.map(region => {
    const items = assigned.get(region.id).sort((a, b) => a.y - b.y || a.x - b.x)
    const reference = normalizeOcrText(region.text)
    const prediction = normalizeOcrText(items.map(item => item.text).join(" "))
    const refChars = [...reference], predChars = [...prediction]
    const refWords = reference ? reference.split(" ") : [], predWords = prediction ? prediction.split(" ") : []
    return { id: region.id, reference, prediction, matchedItems: items.length,
      referenceChars: refChars.length, characterErrors: editDistance(refChars, predChars),
      referenceWords: refWords.length, wordErrors: editDistance(refWords, predWords) }
  })
  const total = key => fields.reduce((sum, field) => sum + field[key], 0)
  const referenceChars = total("referenceChars"), referenceWords = total("referenceWords")
  return { fields, summary: { regions: regions.length, matchedRegions: fields.filter(field => field.matchedItems > 0).length,
    ocrItems: ocrItems.length, unassignedItems,
    referenceChars, characterErrors: total("characterErrors"), cer: referenceChars ? total("characterErrors") / referenceChars : null,
    referenceWords, wordErrors: total("wordErrors"), wer: referenceWords ? total("wordErrors") / referenceWords : null } }
}
