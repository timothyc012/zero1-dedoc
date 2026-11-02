import { flattenTranslate } from "./flat.mts"
import { fileURLToPath, pathToFileURL } from "node:url"
const REPO = fileURLToPath(new URL("../..", import.meta.url))
const at = (p: string) => pathToFileURL(REPO + p).href

// 우리 렌더 그림(<use>) 위치 vs 한컴 PDF 그림 bbox — 크기 ±1.5pt 로 짝지어 위치 ±2pt 일치 비율
import { readFileSync, existsSync } from "node:fs"
const [jsonPath] = process.argv.slice(2)
const { renderHwpxPages } = await import(at("src/render/svg-render.ts"))
const pdfImgs: Record<string, number[][][]> = JSON.parse(readFileSync(jsonPath, "utf8"))
let pairs = 0, ok = 0, okX = 0, okY = 0
const bad: string[] = []
for (const [pdf, pages] of Object.entries(pdfImgs)) {
  const hwpx = pdf.slice(0, -4) + ".hwpx"
  if (!existsSync(hwpx)) continue
  let r
  try { r = await renderHwpxPages(readFileSync(hwpx)) } catch { continue }
  if (r.pageSvgs.size !== pages.length) continue
  for (let k = 0; k < pages.length; k++) {
    const svg: string = flattenTranslate(r.pageSvgs.get(k + 1) ?? "")
    const ours = [...svg.matchAll(/<use href="#[^"]+" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => m.slice(1, 5).map(Number))
    const used = new Set<number>()
    for (const b of pages[k]) {
      const w = b[2] - b[0], h = b[3] - b[1]
      if (w < 3 || h < 3) continue
      let best = -1, bd = Infinity
      ours.forEach((o, i) => {
        if (used.has(i) || Math.abs(o[2] - w) > 1.5 || Math.abs(o[3] - h) > 1.5) return
        const d = Math.abs(o[0] - b[0]) + Math.abs(o[1] - b[1]); if (d < bd) { bd = d; best = i }
      })
      if (best < 0) continue
      used.add(best); pairs++
      const o = ours[best], dx = Math.abs(o[0] - b[0]) <= 2, dy = Math.abs(o[1] - b[1]) <= 2
      if (dx) okX++; if (dy) okY++; if (dx && dy) ok++
      else if (bad.length < 100000) bad.push(`p${k + 1} dx ${(o[0] - b[0]).toFixed(1)} dy ${(o[1] - b[1]).toFixed(1)} ${hwpx.split("/").slice(-2).join("/").slice(0, 60)}`)
    }
  }
}
console.log(`pairs ${pairs} ok ${ok} (${(100 * ok / pairs).toFixed(1)}%) x ${okX} y ${okY}`)
if (process.env.BAD) for (const b of bad) console.log(" ", b)
