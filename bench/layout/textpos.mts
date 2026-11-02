import { flattenTranslate } from "./flat.mts"
import { fileURLToPath, pathToFileURL } from "node:url"
const REPO = fileURLToPath(new URL("../..", import.meta.url))
const at = (p: string) => pathToFileURL(REPO + p).href

// 우리 SVG <text> 조각 vs 한컴 PDF span — 같은 문자열(쪽 안 유일, 4자+)로 짝지어 원점 차이
import { readFileSync, existsSync } from "node:fs"
const [jsonPath] = process.argv.slice(2)
const { renderHwpxPages } = await import(at("src/render/svg-render.ts"))
const spans: Record<string, [string, number, number, number[]][][]> = JSON.parse(readFileSync(jsonPath, "utf8"))
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
const fineY: Record<string, number> = {}
const byFs: Record<string, number[]> = {}
let pairs = 0, okY = 0, okX = 0, ok = 0, dumpN = 0
const dys: Record<string, number> = {}, dxs: Record<string, number> = {}, perDoc: Record<string, [number, number]> = {}
for (const [pdf, pages] of Object.entries(spans)) {
  const hwpx = pdf.slice(0, -4) + ".hwpx"
  if (!existsSync(hwpx)) continue
  let r
  try { r = await renderHwpxPages(readFileSync(hwpx)) } catch { continue }
  if (r.pageSvgs.size !== pages.length) continue
  for (let k = 0; k < pages.length; k++) {
    const svg: string = flattenTranslate(r.pageSvgs.get(k + 1) ?? "")
    const ours = new Map<string, [number, number, number, number][]>()
    for (const m of svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" font-size="([-\d.]+)"[^>]*>([^<]+)<\/text>/g)) { const raw = unesc(m[4]), t = raw.trim(); if (t.length >= 4) { const a = ours.get(t) ?? []; a.push([+m[1], +m[2], raw.length - raw.trimStart().length, +m[3]]); ours.set(t, a) } }
    const cnt = new Map<string, number>(); for (const [t] of pages[k]) cnt.set(t, (cnt.get(t) ?? 0) + 1)
    for (const [t, x0, y, lead] of pages[k]) {
      if (cnt.get(t) !== 1) continue
      const o = ours.get(t); if (!o || o.length !== 1) continue
      // 우리 조각이 공백 L 개로 시작하면 PDF 에서도 첫 글자 앞 L 번째 공백 원점과 비교
      const L = o[0][2]
      if (L > lead.length) continue
      const sx = process.env.SCALEPDF ? 595.28 / 595 : 1, sy = process.env.SCALEPDF ? 841.88 / 841 : 1
      const x = (L ? lead[lead.length - L] : x0) * sx
      const yS = y * sy
      pairs++
      const dx = o[0][0] - x, dy = o[0][1] - yS
      const ax = Math.abs(dx) <= 1.5, ay = Math.abs(dy) <= 1.5
      if (ax) okX++; if (ay) okY++; if (ax && ay) ok++
      if (process.env.BYFS && Math.abs(dy) < 1.5) { const k = String(o[0][3]); (byFs[k] ??= []).push(dy) }
      if (process.env.FINE && Math.abs(dy) < 1.5) fineY[String(Math.round(dy * 10) / 10)] = (fineY[String(Math.round(dy * 10) / 10)] ?? 0) + 1
      dys[String(Math.round(dy))] = (dys[String(Math.round(dy))] ?? 0) + 1; dxs[String(Math.round(dx))] = (dxs[String(Math.round(dx))] ?? 0) + 1
      const pd = (perDoc[hwpx.split("/").pop()!.slice(0, 40)] ??= [0, 0]); pd[0]++; if (ax && ay) pd[1]++
      if (process.env.DOC && hwpx.includes(process.env.DOC) && !(ax && ay) && dumpN++ < Number(process.env.DN ?? 40)) console.log("DOC p" + (k + 1), t.slice(0, 20), "d", dx.toFixed(1), dy.toFixed(1), "ours", o[0][0], o[0][1])
      if (process.env.DXK && Math.round(dx) === Number(process.env.DXK) && dumpN++ < 30) console.log("DX", hwpx.split("/").pop()!.slice(0, 30), "p" + (k + 1), t.slice(0, 20), "ours", o[0][0], "pdf", x)
      if (process.env.DYK && Math.round(dy) === Number(process.env.DYK) && dumpN++ < 30) console.log("DY", hwpx.split("/").pop()!.slice(0, 30), "p" + (k + 1), t.slice(0, 20), "ours", o[0][1], "pdf", y)
    }
  }
}
console.log(`pairs ${pairs} ok ${ok} (${(100 * ok / pairs).toFixed(1)}%) x ${okX} y ${okY}`)
const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(" ")
console.log("dy", top(dys)); if (process.env.BYFS) console.log(Object.entries(byFs).filter(([, v]) => v.length > 200).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}pt n${v.length} mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`).join("\n")); if (process.env.FINE) console.log("fineY", Object.entries(fineY).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k}:${v}`).join(" ")); console.log("dx", top(dxs))
if (process.env.BADSORT) console.log(Object.entries(perDoc).sort((a, b) => (b[1][0] - b[1][1]) - (a[1][0] - a[1][1])).slice(0, 20).map(([k, v]) => `bad ${v[0] - v[1]} / ${v[0]} ${k}`).join("\n"))
console.log(Object.entries(perDoc).filter(([, v]) => v[0] >= 20).sort((a, b) => a[1][1] / a[1][0] - b[1][1] / b[1][0]).slice(0, Number(process.env.WORST ?? 10)).map(([k, v]) => `${v[1]}/${v[0]} ${k}`).join("\n"))
