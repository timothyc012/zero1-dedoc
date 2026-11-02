/** 재현 윤곽만 담은 최소 TrueType. 테스트에 원본 글꼴 파일을 배포하지 않는다. */
export function outlineFont(upm: number, contours: Array<Array<[number, number, boolean]>>): Uint8Array {
  return outlineFontGlyphs(upm, [contours])
}

/** 글리프 여럿 — U+E000 부터 차례로 gid 1, 2, … */
export function outlineFontGlyphs(upm: number, glyphs: Array<Array<Array<[number, number, boolean]>>>): Uint8Array {
  const u16 = (v: number) => [(v >> 8) & 255, v & 255]
  const u32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]
  const glyf: number[] = [], loca = [...u16(0), ...u16(0)]
  for (const contours of glyphs) {
    const pts = contours.flat(), glyph = [...u16(contours.length), ...u16(0), ...u16(0), ...u16(upm), ...u16(upm)]
    let end = -1
    for (const c of contours) { end += c.length; glyph.push(...u16(end)) }
    glyph.push(0, 0, ...pts.map(p => p[2] ? 1 : 0))
    let last = 0
    for (const [x] of pts) { glyph.push(...u16(x - last)); last = x }
    last = 0
    for (const [, y] of pts) { glyph.push(...u16(y - last)); last = y }
    if (glyph.length % 2) glyph.push(0)
    glyf.push(...glyph)
    loca.push(...u16(glyf.length / 2))
  }
  const head = Array(54).fill(0); head.splice(18, 2, ...u16(upm))
  // cmap4: U+E000~ → gid1~, U+FFFF → gid0.
  const sub = [...u16(4), ...u16(32), 0, 0, ...u16(4), 0, 0, 0, 0, 0, 0,
    ...u16(0xe000 + glyphs.length - 1), ...u16(0xffff), 0, 0, ...u16(0xe000), ...u16(0xffff), ...u16(1 - 0xe000), ...u16(1), 0, 0, 0, 0]
  const cmap = [0, 0, 0, 1, 0, 3, 0, 1, ...u32(12), ...sub]
  const tables: Array<[string, number[]]> = [["cmap", cmap], ["glyf", glyf], ["head", head], ["loca", loca]]
  const out = [...u32(0x10000), ...u16(tables.length), 0, 0, 0, 0, 0, 0], bodies: number[] = []
  for (const [name, data] of tables) {
    out.push(...[...name].map(c => c.charCodeAt(0)), 0, 0, 0, 0, ...u32(12 + tables.length * 16 + bodies.length), ...u32(data.length))
    bodies.push(...data); while (bodies.length % 4) bodies.push(0)
  }
  return new Uint8Array([...out, ...bodies])
}
