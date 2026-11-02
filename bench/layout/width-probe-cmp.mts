// width-probe-read.py 결과(한컴 실측 글자 폭 HWPUNIT) ↔ kordoc hancomCharWidth(같은 크기·장평·자간, faceClassForReflow) 글꼴·글자별 대조
// 사용: node --import tsx bench/layout/width-probe-cmp.mts widths.json [faces.json — 빈도] ; DUMP=키 면 그 키의 다른 글자 목록
import { readFileSync } from "node:fs"
import { hancomCharWidth, faceClassForReflow } from "../../src/hwpx/text-metrics.js"

const W = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, { pdfFonts: Record<string, number>; w: Record<string, [number, string]> }>
const F = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")) as Record<string, { n: number }> : {}
const rows: [string, number, number, number, string][] = []
for (const [key, v] of Object.entries(W)) {
  const [face, typ, h, r, s] = key.split("|")
  const fc = faceClassForReflow(face)
  let ok = 0, bad = 0
  const diffs: string[] = []
  for (const [ch, [hu]] of Object.entries(v.w)) {
    const ours = hancomCharWidth(ch, Number(h), Number(r), Number(s), fc)
    if (Math.abs(ours - hu) <= 2) ok++
    else { bad++; if (diffs.length < 400) diffs.push(`${ch}(${ch.codePointAt(0)!.toString(16)}) 한컴 ${hu} 우리 ${ours}`) }
  }
  rows.push([key, ok, bad, F[`${face}|${typ}`]?.n ?? 0, fc])
  if (process.env.DUMP === key) console.log(diffs.join("\n"))
}
rows.sort((a, b) => b[3] - a[3])
for (const [k, ok, bad, n, fc] of rows) console.log(`${String(bad).padStart(5)} 다름 / ${String(ok + bad).padStart(5)}  빈도 ${String(n).padStart(8)}  ${k}  (${fc})  PDF ${Object.keys(W[k].pdfFonts).slice(0, 3).join(",")}`)
