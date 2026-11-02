// 짝 PDF 가 있는 HWPX: kordoc 렌더 쪽 수 vs 한컴 PDF 쪽 수
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
const REPO = fileURLToPath(new URL("../..", import.meta.url))
const at = (p: string) => pathToFileURL(REPO + p).href
const { renderHwpxPages } = await import(at("src/render/svg-render.ts"))
let same = 0, n = 0; const diff: string[] = []
for (const dir of process.argv.slice(2)) for (const f of readdirSync(dir)) {
  if (!f.endsWith(".hwpx")) continue
  const pdf = join(dir, f.slice(0, -5) + ".pdf")
  if (!existsSync(pdf)) continue
  let pp: number
  // 가로 쪽 PDF(높이 < 폭)는 세로 문서를 한 장에 두 쪽 모아 찍은 것 — 쪽 수 ×2 (마지막 장 반만 차면 −1 도 같다고 본다)
  let landscape = false
  try { const [n, w, h] = execFileSync(process.env.PYTHON ?? "python3", ["-c", "import sys,pymupdf; d=pymupdf.open(sys.argv[1]); print(len(d), d[0].rect.width, d[0].rect.height)", pdf]).toString().trim().split(" ").map(Number); pp = n; landscape = w > h } catch { continue }
  let ours: number
  try { ours = (await renderHwpxPages(readFileSync(join(dir, f)))).pageSvgs.size } catch { continue }
  n++; if (ours === pp || (landscape && (ours === 2 * pp || ours === 2 * pp - 1))) same++; else diff.push(`${ours - pp > 0 ? "+" : ""}${ours - pp} ours ${ours} pdf ${pp} ${f.slice(0, 50)}`)
}
console.log("same", same, "/", n); for (const d of diff) console.log(" ", d)
