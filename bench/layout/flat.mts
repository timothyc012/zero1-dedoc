// 측정 도구용 — <g transform=…> 묶음(translate·matrix·scale·rotate) 안 <use>·<text> 의 x·y 를 누적 변환한 좌표로 바꾼 SVG.
// 잘라 쓴 그림(<svg x y width height viewBox><use/></svg>)은 그 바깥 상자를 그림 자리로
type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
function parse(t: string): M {
  let m: M = [1, 0, 0, 1, 0, 0]
  for (const f of t.matchAll(/(translate|matrix|scale|rotate)\(([^)]*)\)/g)) {
    const a = f[2].split(/[ ,]+/).filter(Boolean).map(Number)
    let n: M = [1, 0, 0, 1, 0, 0]
    if (f[1] === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]
    else if (f[1] === "matrix") n = a.slice(0, 6) as M
    else if (f[1] === "scale") n = [a[0], 0, 0, a[1] ?? a[0], 0, 0]
    else { const r = (a[0] * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), cx = a[1] ?? 0, cy = a[2] ?? 0; n = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]) }
    m = mul(m, n)
  }
  return m
}
export function flattenTranslate(svg0: string): string {
  const svg = svg0.replace(/<svg x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*><use href="([^"]+)"[^>]*\/><\/svg>/g, (_m, x, y, w, h, href) => `<use href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>`)
  const stack: M[] = []
  let cur: M = [1, 0, 0, 1, 0, 0]
  return svg.replace(/<g\b[^>]*>|<\/g>|<(use|text)\b([^>]*)>/g, (tag, el, attrs) => {
    if (tag.startsWith("<g")) { stack.push(cur); const m = /transform="([^"]+)"/.exec(tag); if (m) cur = mul(cur, parse(m[1])); return tag }
    if (tag === "</g>") { cur = stack.pop() ?? [1, 0, 0, 1, 0, 0]; return tag }
    if (cur.every((v, i) => v === [1, 0, 0, 1, 0, 0][i])) return tag
    const x = Number(/\bx="([-\d.]+)"/.exec(attrs)?.[1] ?? 0), y = Number(/\by="([-\d.]+)"/.exec(attrs)?.[1] ?? 0)
    const X = cur[0] * x + cur[2] * y + cur[4], Y = cur[1] * x + cur[3] * y + cur[5]
    if (el === "use") {
      const w = Number(/\bwidth="([-\d.]+)"/.exec(attrs)?.[1] ?? 0), h = Number(/\bheight="([-\d.]+)"/.exec(attrs)?.[1] ?? 0)
      const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => [cur[0] * px + cur[2] * py + cur[4], cur[1] * px + cur[3] * py + cur[5]])
      const x0 = Math.min(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), x1 = Math.max(...pts.map(p => p[0])), y1 = Math.max(...pts.map(p => p[1]))
      const r = (v: number) => Math.round(v * 100) / 100
      return `<use` + attrs.replace(/\bx="[-\d.]+"/, `x="${r(x0)}"`).replace(/\by="[-\d.]+"/, `y="${r(y0)}"`).replace(/\bwidth="[-\d.]+"/, `width="${r(x1 - x0)}"`).replace(/\bheight="[-\d.]+"/, `height="${r(y1 - y0)}"`) + ">"
    }
    return `<${el}` + attrs.replace(/\bx="[-\d.]+"/, `x="${Math.round(X * 100) / 100}"`).replace(/\by="[-\d.]+"/, `y="${Math.round(Y * 100) / 100}"`) + ">"
  })
}
