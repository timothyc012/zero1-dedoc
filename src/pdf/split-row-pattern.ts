import type { IRCell, IRTable } from "../types.js"
import { CELL_LINES, IMAGE_CELLS } from "./table-meta.js"
import { CELL_EDGES, CELL_PAGES } from "../table/layout-frames.js"

type Owner = { r: number; c: number; rs: number; cs: number; cell?: IRCell }
const textOf = (cell: IRCell): string => cell.text.replace(/<\/?u>|~~/g, "").trim()
const plain = (cell: IRCell): boolean => !cell.blocks?.length && !IMAGE_CELLS.has(cell)

const labelsOf = (cell: IRCell): string[] | undefined => {
  const labels = textOf(cell).split("\n").map(s => s.trim()).filter(Boolean)
  return labels.length && labels.every(s => /^\p{L}[\p{L}\p{N} ]{0,15}[:：]$/u.test(s))
    ? labels.map(s => s.replace(/\s+/g, "").replace(/：/g, ":")) : undefined
}
const alignedLabels = (label: IRCell, value: IRCell, count: number): boolean => {
  const L = CELL_LINES.get(label), V = CELL_LINES.get(value)
  let next = 0
  return !!L && !!V && L.length === count && V.length >= count && Math.abs(L[0].y - V[0].y) <= 1
    && L.every(l => { while (next < V.length && Math.abs(l.y - V[next].y) > 1) next++; return next++ < V.length })
}

/** 독립 문맥행 옆 목록 셀만 쪽을 넘는 모양 — 같은 표의 완성 목록과 세로 병합 짜임으로 확인한다. */
export function partialAlignedLabelCells(table: IRTable, owner: (Owner | null)[][], first: number) {
  // 복사 전 칸의 쪽 표시를 본다. 표시가 없으면 각 원래 조각의 첫 쪽이며 두 조각은 서로 다른 쪽이다.
  const pageOf = (a: Owner) => CELL_PAGES.get(a.cell ?? table.cells[a.r][a.c]) ?? (a.r < first ? -1 : -2)
  const pairs: Array<{ c: number; cs: number; upper: IRCell; lower: IRCell }> = []
  let carried = false
  for (let c = 0; c < table.cols;) {
    const u = owner[first - 1]?.[c], d = owner[first]?.[c]
    if (u && u === d) { carried = true; c = u.c + u.cs; continue }
    const upper = u ? table.cells[u.r][u.c] : undefined, lower = d ? table.cells[d.r][d.c] : undefined
    if (!upper?.text.trim() && !lower?.text.trim()) { c++; continue }
    if (!u || !d || !upper || !lower || u.r !== first - 1 || d.r !== first || u.c !== c || d.c !== c
      || u.rs !== 1 || d.rs !== 1 || u.cs !== d.cs || !plain(upper) || !plain(lower) || !textOf(upper) || !textOf(lower)) return
    pairs.push({ c, cs: u.cs, upper, lower }); c += u.cs
  }
  if (!carried || pairs.length !== 3) return
  const keyed = pairs.filter(p => labelsOf(p.upper) && labelsOf(p.lower))
  if (keyed.length !== 1) return
  const label = keyed[0], value = pairs.find(p => p.c === label.c + label.cs), context = pairs.find(p => p.c + p.cs === label.c)
  if (!value || !context || value === context || textOf(context.upper).replace(/\s+/g, "") === textOf(context.lower).replace(/\s+/g, "")
    || !CELL_EDGES.get(context.upper)?.b || !CELL_EDGES.get(context.lower)?.t) return
  const U = labelsOf(label.upper)!, D = labelsOf(label.lower)!, sequence = [...U, ...D]
  if (D.length < 2 || sequence.length < 3 || new Set(sequence).size !== sequence.length
    || !alignedLabels(label.upper, value.upper, U.length)) return
  const L = CELL_LINES.get(label.lower), V = CELL_LINES.get(value.lower)
  if (!L || !V || L.length !== D.length) return
  // 첫 라벨보다 위의 값 줄은 앞 쪽 마지막 라벨에 속한다. 각 라벨은 서로 다른 값 줄에 맞아야 한다.
  let next = V.findIndex(v => Math.abs(v.y - L[0].y) <= 1)
  if (next <= 0 || !V.slice(0, next).every(v => v.y > L[0].y + 1)
    || !L.every(l => { while (next < V.length && Math.abs(l.y - V[next].y) > 1) next++; return next++ < V.length })) return
  let peers = 0, shared = false
  for (let r = 0; r < table.rows; r++) {
    if (r === first - 1 || r === first) continue
    const l = owner[r]?.[label.c], v = owner[r]?.[value.c]
    if (!l || !v || l.r !== r || v.r !== r || l.c !== label.c || v.c !== value.c || l.cs !== label.cs || v.cs !== value.cs || l.rs !== v.rs) continue
    const lc = table.cells[r][l.c], vc = table.cells[r][v.c]
    const list = labelsOf(lc)
    if (!plain(lc) || !plain(vc) || !textOf(vc) || !list || pageOf(l) !== pageOf(v)) continue
    if (l.rs === 1) {
      if (list.join("|") === sequence.join("|") && alignedLabels(lc, vc, list.length)) peers++
      continue
    }
    if (list.length < 3 || new Set(list).size !== list.length) continue
    // 다음 쪽까지 이미 이은 셀도 줄 좌표가 남은 같은 쪽 범위만 근거로 쓴다.
    const visible = CELL_LINES.get(lc)?.length ?? 0, values = CELL_LINES.get(vc)
    if (visible < 3 || visible > list.length || !values || !alignedLabels(lc, vc, visible)) continue
    const top = Math.max(...values.map(v => v.y)), bottom = Math.min(...values.map(v => v.y))
    const contexts: string[] = []
    for (let rr = r; rr < r + l.rs && rr < table.rows; rr++) {
      const a = owner[rr]?.[context.c], cell = a ? table.cells[a.r][a.c] : undefined
      if (!a || a.r !== rr || a.c !== context.c || a.cs !== context.cs || a.rs !== 1 || !cell || !plain(cell) || !textOf(cell) || pageOf(a) !== pageOf(l)) break
      const lines = CELL_LINES.get(cell)
      if (!lines?.length || lines.some(line => line.y > top + 1 || line.y < bottom - 1)) break
      contexts.push(textOf(cell).replace(/\s+/g, ""))
    }
    if (new Set(contexts).size >= 2) shared = true
  }
  return peers >= 2 && shared ? { context, label, value } : undefined
}

/** 쪽 경계의 라벨 목록이 같은 표의 완성행과 같고 값 줄마다 정렬돼 있으면, 한 행의 이어진 조각이다. */
export function matchesCompleteAlignedLabelListRow(table: IRTable, owner: (Owner | null)[][], first: number): boolean {
  const pairs: Array<{ c: number; cs: number; upper: IRCell; lower: IRCell }> = []
  let carried = false
  for (let c = 0; c < table.cols;) {
    const u = owner[first - 1]?.[c], d = owner[first]?.[c]
    if (u && u === d) { carried = true; c = u.c + u.cs; continue }
    const upper = u ? table.cells[u.r][u.c] : undefined, lower = d ? table.cells[d.r][d.c] : undefined
    if (!upper?.text.trim() && !lower?.text.trim()) { c++; continue }
    if (!u || !d || !upper || !lower || u.r !== first - 1 || d.r !== first || u.c !== c || d.c !== c
      || u.rs !== 1 || d.rs !== 1 || u.cs !== d.cs || !plain(upper) || !plain(lower)) return false
    pairs.push({ c, cs: u.cs, upper, lower }); c += u.cs
  }
  const filled = pairs.filter(p => textOf(p.upper) && textOf(p.lower))
  if (!carried || filled.length !== 2) return false
  const keyed = filled.filter(p => labelsOf(p.upper) && labelsOf(p.lower))
  if (keyed.length !== 1) return false
  const label = keyed[0], value = filled.find(p => p !== label)!
  const U = labelsOf(label.upper)!, D = labelsOf(label.lower)!, sequence = [...U, ...D]
  if (D.length < 2 || sequence.length < 3 || new Set(sequence).size !== sequence.length
    || value.c !== label.c + label.cs || pairs.some(p => p !== label && p !== value && textOf(p.lower))
    || !pairs.some(p => p.c < label.c && textOf(p.upper) && !textOf(p.lower))
    || !alignedLabels(label.upper, value.upper, U.length) || !alignedLabels(label.lower, value.lower, D.length)) return false
  let peers = 0
  for (let r = 0; r < table.rows; r++) {
    if (r === first - 1 || r === first) continue
    const L = owner[r]?.[label.c], V = owner[r]?.[value.c]
    if (L?.r !== r || V?.r !== r || L.c !== label.c || V.c !== value.c
      || L.rs !== 1 || V.rs !== 1 || L.cs !== label.cs || V.cs !== value.cs) continue
    const l = table.cells[r][label.c], v = table.cells[r][value.c]
    if (!plain(l) || !plain(v) || !textOf(v) || labelsOf(l)?.join("|") !== sequence.join("|")
      || !alignedLabels(l, v, sequence.length)) continue
    if (++peers >= 2) return true
  }
  return false
}

/** 같은 표의 다른 위치에서 이미 독립된 두 행으로 반복된 내용 쌍은 새 행 증거다. */
export function matchesIndependentRowPair(table: IRTable, owner: (Owner | null)[][], first: number): boolean {
  const norm = (cell: IRCell): string => textOf(cell).replace(/\s+/g, "")
  const pairs: Array<{ c: number; cs: number; upper: string; lower: string }> = []
  for (let c = 0; c < table.cols;) {
    const u = owner[first - 1]?.[c], d = owner[first]?.[c]
    if (u && u === d) { c = u.c + u.cs; continue }
    const upper = u ? table.cells[u.r][u.c] : undefined, lower = d ? table.cells[d.r][d.c] : undefined
    if (!upper?.text.trim() && !lower?.text.trim()) { c++; continue }
    if (!u || !d || !upper || !lower || u.r !== first - 1 || d.r !== first || u.c !== c || d.c !== c
      || u.rs !== 1 || d.rs !== 1 || u.cs !== d.cs || !plain(upper) || !plain(lower) || !norm(upper) || !norm(lower)) return false
    pairs.push({ c, cs: u.cs, upper: norm(upper), lower: norm(lower) })
    c += u.cs
  }
  if (pairs.length < 2 || pairs.every(p => p.upper === p.lower)) return false
  return table.cells.some((_, r) => {
    if (r + 1 >= table.rows || r + 1 >= first - 1 && r <= first) return false
    return pairs.every(p => [p.upper, p.lower].every((text, i) => {
      const a = owner[r + i]?.[p.c], cell = table.cells[r + i]?.[p.c]
      return a?.r === r + i && a.c === p.c && a.rs === 1 && a.cs === p.cs && !!cell && plain(cell) && norm(cell) === text
    }))
  })
}

/** 경계만 덮는 항목명과 합친 값이 같은 표의 완성행에 함께 있으면, 가운데 정렬 값도 이어진 셀이다. */
export function matchesCompleteContextRow(table: IRTable, owner: (Owner | null)[][], first: number): boolean {
  const norm = (s: string): string => s.replace(/\s+/g, "")
  const context: Array<{ c: number; cs: number; text: string }> = []
  let value: { c: number; cs: number; text: string } | undefined
  for (let c = 0; c < table.cols;) {
    const u = owner[first - 1]?.[c], d = owner[first]?.[c]
    if (u && u === d) {
      const cell = table.cells[u.r][u.c]
      if (u.r === first - 1 && u.rs === 2 && plain(cell) && textOf(cell)) context.push({ c, cs: u.cs, text: norm(textOf(cell)) })
      c = u.c + u.cs; continue
    }
    const upper = u ? table.cells[u.r][u.c] : undefined, lower = d ? table.cells[d.r][d.c] : undefined
    if (!upper?.text.trim() && !lower?.text.trim()) { c++; continue }
    if (value || !u || !d || !upper || !lower || u.r !== first - 1 || d.r !== first || u.c !== c || d.c !== c
      || u.rs !== 1 || d.rs !== 1 || u.cs !== d.cs || !plain(upper) || !plain(lower) || !textOf(upper) || !textOf(lower)) return false
    value = { c, cs: u.cs, text: norm(textOf(upper) + textOf(lower)) }
    c += u.cs
  }
  if (!value || !context.length) return false
  const proof = [...context, value]
  return table.cells.some((row, r) => r !== first - 1 && r !== first && proof.every(p => {
    const a = owner[r]?.[p.c], cell = row[p.c]
    return a?.r === r && a.c === p.c && a.rs === 1 && a.cs === p.cs && !!cell && plain(cell) && norm(textOf(cell)) === p.text
  }))
}

/** 상위 항목과 하위 목록이 쪽 경계에서 갈렸는지, 같은 표의 완성행 전체를 근거로 확인한다. */
export function matchesCompleteSiblingRow(table: IRTable, owner: (Owner | null)[][], first: number): boolean {
  const pairs: Array<{ c: number; cs: number; upper: IRCell; lower: IRCell }> = []
  for (let c = 0; c < table.cols;) {
    const u = owner[first - 1][c], d = owner[first][c]
    if (u && u === d) { c = u.c + u.cs; continue }
    if (!u || !d || u.r !== first - 1 || d.r !== first || u.c !== c || d.c !== c || u.rs !== 1 || d.rs !== 1 || u.cs !== d.cs) return false
    const upper = table.cells[u.r][c], lower = table.cells[d.r][c]
    if (!plain(upper) || !plain(lower)) return false
    pairs.push({ c, cs: u.cs, upper, lower })
    c += u.cs
  }
  const filled = pairs.filter(p => textOf(p.upper) && textOf(p.lower))
  if (filled.length !== 1) return false
  const main = filled[0], upper = textOf(main.upper), lower = textOf(main.lower)
  if (!/^[가-힣]\.\s*\S/.test(upper) || /(?:^|\n)\s*\d+\)/.test(upper)) return false
  const marks = lower.split("\n").map(s => /^\s*(\d+)\)/.exec(s)).filter(m => m !== null)
  if (!/^1\)/.test(lower) || marks.length < 2 || marks.some((m, i) => +m[1] !== i + 1)) return false
  if (pairs.some(p => p !== main && textOf(p.lower) && !/^[○●◯✓✔]+$/.test(textOf(p.lower)))) return false
  if (!pairs.some(p => p !== main && textOf(p.upper) && !textOf(p.lower))) return false
  const norm = (s: string, title: boolean): string => (title ? s.replace(/^[가-힣]\.\s*/, "") : s).replace(/\s+/g, "")
  return table.cells.some((row, r) => r !== first - 1 && r !== first && pairs.every(p => {
    const anchor = owner[r][p.c], peer = row[p.c]
    return anchor?.r === r && anchor.c === p.c && anchor.rs === 1 && anchor.cs === p.cs && plain(peer)
      && norm(textOf(peer), p === main) === norm(textOf(p.upper) + "\n" + textOf(p.lower), p === main)
  }))
}

/** 분류칸이 이어지고, 완성된 평가행의 번호·점수열·마지막 항목까지 같을 때만 목록 조각을 잇는다. */
export function matchesCompleteRubricRow(table: IRTable, owner: (Owner | null)[][], first: number): boolean {
  const pairs: Array<{ c: number; cs: number; upper: IRCell; lower: IRCell }> = []
  let carriedLabel = false
  for (let c = 0; c < table.cols;) {
    const u = owner[first - 1][c], d = owner[first][c]
    if (u && u === d) {
      if (u.r === first - 1 && u.rs === 2 && textOf(table.cells[u.r][u.c])) carriedLabel = true
      c = u.c + u.cs
      continue
    }
    if (!u || !d || u.r !== first - 1 || d.r !== first || u.c !== c || d.c !== c || u.rs !== 1 || d.rs !== 1 || u.cs !== d.cs) return false
    const upper = table.cells[u.r][c], lower = table.cells[d.r][c]
    if (!plain(upper) || !plain(lower) || !textOf(upper) || !textOf(lower)) return false
    pairs.push({ c, cs: u.cs, upper, lower })
    c += u.cs
  }
  if (!carriedLabel || pairs.length !== 2) return false
  const values = (cell: IRCell): string[] => textOf(cell).split("\n").map(s => s.trim()).filter(Boolean)
  const score = pairs.find(p => [...values(p.upper), ...values(p.lower)].every(s => /^-?\d+(?:\.\d+)?$/.test(s)))
  if (!score) return false
  const main = pairs.find(p => p !== score)!
  const items = (s: string) => [...s.matchAll(/(?:^|\n)\s*([A-Z])\.\s+/g)].map(m => ({ n: m[1].charCodeAt(0), at: m.index! + m[0].lastIndexOf(m[1]) }))
  const upper = textOf(main.upper), lower = textOf(main.lower), um = items(upper), dm = items(lower), marks = [...um, ...dm]
  if (!/^A\.\s/.test(upper) || !/^B\.\s/.test(lower) || um.length !== 1 || dm.length < 2 || marks.some((m, i) => m.n !== 65 + i)) return false
  const upScores = values(score.upper), downScores = values(score.lower), scores = [...upScores, ...downScores]
  if (upScores.length !== um.length || downScores.length !== dm.length) return false
  const norm = (s: string): string => s.replace(/\s+/g, "")
  const tail = norm(lower.slice(dm[dm.length - 1].at))
  return table.cells.some((row, r) => {
    if (r === first - 1 || r === first || !pairs.every(p => {
      const a = owner[r][p.c]
      return a?.r === r && a.c === p.c && a.rs === 1 && a.cs === p.cs && plain(row[p.c])
    })) return false
    const peer = textOf(row[main.c]), peerMarks = items(peer)
    return peerMarks.length === marks.length && peerMarks.every((m, i) => m.n === marks[i].n)
      && values(row[score.c]).join("|") === scores.join("|") && norm(peer.slice(peerMarks[peerMarks.length - 1].at)) === tail
  })
}

/** 한글 항목 번호 차례 */
const KO_ORDER = "가나다라마바사아자차카타파하"
/** 줄 머리 항목 번호 — 꼴(1.·1)·(1)·가.·가)·(가)·①·A.)과 차례 */
export function itemMark(line: string): { style: string; n: number } | null {
  line = line.replace(/<\/?u>|~~/g, "").trim()
  let m = /^(\d{1,2})([.)])(?!\d)/.exec(line)
  if (m) return { style: "1" + m[2], n: +m[1] }
  if ((m = /^\((\d{1,2})\)/.exec(line))) return { style: "(1)", n: +m[1] }
  if ((m = /^([가-하])([.)])/.exec(line)) && KO_ORDER.includes(m[1])) return { style: "가" + m[2], n: KO_ORDER.indexOf(m[1]) }
  if ((m = /^\(([가-하])\)/.exec(line)) && KO_ORDER.includes(m[1])) return { style: "(가)", n: KO_ORDER.indexOf(m[1]) }
  if ((m = /^[①-⑳]/.exec(line))) return { style: "①", n: m[0].charCodeAt(0) }
  if ((m = /^([A-Z])\.\s/.exec(line))) return { style: "A.", n: m[1].charCodeAt(0) }
  return null
}

/** 연속된 네 완성행이 각각 항목 하나와 독립된 옆칸을 가지면, 쪽 경계도 새 항목 행이다. */
export function hasNumberedRowSequence(table: IRTable, owner: (Owner | null)[][], first: number): boolean {
  if (first < 3) return false
  const rows = [first - 3, first - 2, first - 1, first]
  const separate = (c: number, cs: number): boolean => rows.every(r => {
    const a = owner[r]?.[c], cell = table.cells[r]?.[c]
    return a?.r === r && a.c === c && a.rs === 1 && a.cs === cs && !!cell && plain(cell) && !!textOf(cell)
  })
  for (let c = 0; c < table.cols; c++) {
    const a = owner[first]?.[c]
    if (!a || !separate(c, a.cs)) continue
    const marks = rows.map(r => {
      const lines = textOf(table.cells[r][c]).split("\n"), firstMark = itemMark(lines[0])
      return firstMark && lines.slice(1).every(l => !itemMark(l)) ? firstMark : null
    })
    const head = marks[0]
    if (!head || marks.some((m, i) => !m || m.style !== head.style || m.n !== head.n + i)) continue
    for (let d = 0; d < table.cols; d++) {
      const side = owner[first]?.[d]
      if (side && (d + side.cs <= c || d >= c + a.cs) && separate(d, side.cs)) return true
    }
  }
  return false
}

