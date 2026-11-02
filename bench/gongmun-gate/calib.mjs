// 공문서 게이트(윤문·구성 검수) 실측 — 사람 글(실결재·방침서·기관 공개 문서, 보도자료)과 생성형 AI 초안에서
// 규칙별 문서 적중 수와 게이트 미통과 문서 수를 낸다. 규칙 등급·임계를 바꾸면 이 수치로 확인한다(docs/gongmun-logic.md).
//   node bench/gongmun-gate/calib.mjs            — dist/ 를 쓴다(소스를 고쳤으면 빌드부터)
//   node bench/gongmun-gate/calib.mjs --show RULE — 사람 글에서 그 규칙에 걸린 줄
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const { parse, lintSlopText, lintLogicText } = await import(join(ROOT, "dist/index.js"))
const show = process.argv.includes("--show") ? process.argv[process.argv.indexOf("--show") + 1] : null
const C = join(ROOT, "bench/corpus")

async function docsFrom(dirs, re) {
  const out = []
  for (const d of dirs.map((x) => join(C, x)).filter(existsSync)) {
    for (const f of readdirSync(d).filter((f) => re.test(f)).sort()) {
      const buf = readFileSync(join(d, f))
      try {
        const r = await parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
        if (r.success && r.markdown.length >= 300) out.push({ name: `${d.split("/").pop()}/${f}`, text: r.markdown })
      } catch { /* 파서 게이트가 따로 본다 */ }
    }
  }
  return out
}

const gen = join(ROOT, "bench/corpus-gen/seoul-bangchim")
const sets = {
  "사람(실결재·방침서·공개 문서)": [
    ...await docsFrom(["seoul", "seoul2", "seoul-old", "review", "korea-kr", "korea-kr2", "misc"], /\.hwpx$/i),
    ...await docsFrom(["hwp5", "korea-kr", "pairs"], /\.hwp$/i),
    ...(existsSync(gen) ? readdirSync(gen).filter((f) => f.endsWith(".orig.md")).map((f) => ({ name: `bangchim/${f}`, text: readFileSync(join(gen, f), "utf8") })) : []),
  ],
  "사람(보도자료)": await docsFrom(["korea-kr-pairs", "korea-kr-pairs2"], /\.hwpx$/i),
  "AI 초안": readdirSync(join(ROOT, "bench/gongmun-gate/ai")).sort().map((f) => ({ name: f, text: readFileSync(join(ROOT, "bench/gongmun-gate/ai", f), "utf8") })),
}

for (const [label, docs] of Object.entries(sets)) {
  const hits = new Map()
  let fail = 0
  for (const d of docs) {
    const fs = [...lintSlopText(d.text), ...lintLogicText(d.text)]
    if (fs.length) fail++
    for (const r of new Set(fs.map((f) => f.rule))) hits.set(r, (hits.get(r) ?? 0) + 1)
    if (show && !label.startsWith("AI")) for (const f of fs.filter((f) => f.rule === show).slice(0, 3)) console.log(`   ${d.name.slice(0, 60)} L${f.line} ${f.match}`)
  }
  const pct = docs.length ? ((fail / docs.length) * 100).toFixed(1) : "0"
  console.log(`${label} ${docs.length}건 — 게이트 미통과 ${fail}건(${pct}%)`)
  console.log("  " + [...hits].sort().map(([r, n]) => `${r} ${n}`).join(" · "))
}
