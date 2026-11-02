/** 글자 테두리가 줄 상자에 더하는 높이. */
import type { ParaModel } from "./para-model.js"
import type { RenderStyles } from "./head-styles.js"

export function lineBorderBox(model: ParaModel, styles: RenderStyles, start: number, end: number): [number, number, boolean] {
  const empty = model.chars.length === 0 && model.objs.length === 0
  let top = 0, all = 0
  const include = (prId: string | null): void => {
    const st = prId != null ? styles.charPr.get(prId) : undefined
    const f = st?.borderFill != null ? styles.borderFill.get(st.borderFill) : undefined
    if (!f || (!f.top && !f.bottom)) return
    // 빈 run은 선의 양쪽 정수 반폭을 더한다(0.3mm 저장본: 42×2 = 84HU).
    const width = (pt: number): number => empty ? 2 * Math.trunc(pt * 50) : Math.trunc(pt * 100)
    const t = f.top ? width(f.top.widthPt) : 0, b = f.bottom ? width(f.bottom.widthPt) : 0
    top = Math.max(top, st!.height + t); all = Math.max(all, st!.height + t + b)
  }
  if (empty) for (const run of model.runs) include(run.prId)
  else for (let i = start; i < end; i++) if (model.chars[i].ch) include(model.chars[i].prId)
  return [top, all, empty && all > 0]
}
