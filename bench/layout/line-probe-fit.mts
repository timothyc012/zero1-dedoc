// line-probe.py 탐침의 글자마다 정수 em 후보 중 모든 크기(800 이상) 줄 나눔과 맞는 구간, 우리 폭표와 다른 글자 — 줄 폭 42520(SO-SUEOP 틀) 가정
// 사용: line-probe-fit.mts 출력.rows.json 재조판.PARADUMP.tsv 라틴글꼴id 진하게(0|1) 글꼴이름 구간.json
// 주의: 줄머리·줄끝 금지 글자(닫는·여는 부호)는 금칙 처리 때문에 폭으로 풀리지 않는다. 600·700 크기는 일부 글자가 4 넓게 잡혀 뺐다
import { readFileSync, writeFileSync } from "node:fs"
import { fontAdvanceEm1000 } from "../../src/hwpx/font-metrics.ts"
const rows = JSON.parse(readFileSync(process.argv[2], "utf8")); const W = 42520
const want = Number(process.argv[4]), bold = Number(process.argv[5]), face = process.argv[6]
const by: Record<string, any[]> = {}
for (const l of readFileSync(process.argv[3], "utf8").split("\n")) { if (!l) continue; const [f, i, ok, t] = l.split("\t"); const r = rows[Number(i) - 1]; const tt = JSON.parse(t); if (r[1] === want && r[3] === bold && tt.length > 1 && r[2] >= 800 && (r[5] ?? 0) === 0 && (r[6] ?? 100) === 100) (by[r[r.length - 1]] ??= []).push({ sz: r[2], n: tt[1] }) }
const out: Record<string, number[]> = {}; let same = 0, diff: string[] = []
for (const [ch, hs] of Object.entries(by)) {
  const ok: number[] = []
  for (let em = 100; em <= 1100; em++) if (hs.every(h => Math.floor(W / (4 * Math.round(em * Math.trunc(h.sz / 4) / 1000))) === h.n)) ok.push(em)
  out[ch] = ok
  const ours = fontAdvanceEm1000(face, ch.codePointAt(0)!)
  if (ours !== null && ok.includes(ours)) same++; else diff.push(`${ch}:${ours}→[${ok[0]}..${ok[ok.length - 1]}]`)
}
console.log(face, bold ? "B" : "R", "chars", Object.keys(by).length, "ours ok", same, "diff", diff.join(" "))
writeFileSync(process.argv[7], JSON.stringify(out))
