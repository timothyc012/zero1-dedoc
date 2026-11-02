/**
 * 렌더 가림 잔여(#116) — 한컴 저장본 기하로 돌린 사진·도형, CURVE 조각 곡선, 배율 묶음(renderingInfo 행렬).
 * 한컴은 sz 를 틀(curSz)을 돌린 외접 상자로 쓰고(ta-pic-001-r: 13668×12686 을 34° 돌린 외접 18425×18160),
 * 묶음 안 개체는 renderingInfo 행렬 곱으로 최상위 묶음 상자에 놓는다(위례선 트램 보도자료 지도 묶음 실측).
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { extractRenderedRegions } from "../src/render/regions.js"
import { renderHwpxPages } from "../src/render/svg-render.js"
import { buildPara, prepareDeletedRanges } from "../src/render/para-model.js"
import { renderingMatrix } from "../src/render/shape-geometry.js"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { cachedPara, floatingPos, occlusionFixture, photo, solid } from "./fixtures/render-occlusion-fixture.js"
import { seg } from "./fixtures/render-fixture.js"

async function redPixels(input: Uint8Array): Promise<number[]> {
  const result = await extractRenderedRegions(input, { types: ["image"], maxWidthPx: 1191 })
  return Promise.all(result.map(async r => {
    const { data, info } = await sharp(r.data).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    let red = 0
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) red++
    return red
  }))
}

const fill = `<hp:lineShape style="NONE"/><hc:fillBrush>${solid}</hc:fillBrush>`
const ident = (tag: string) => `<hc:${tag} e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>`

test("Hancom rotated shape — sz is the rotated bounding box, the frame turns about its center", async () => {
  // 66×90pt 틀을 90° 돌린 외접 90×66pt 가 (195,179.5)pt 에 놓인다 — 빨강(200,180 80×65)을 덮는다
  const rect = `<hp:rect id="c" zOrder="5" textWrap="IN_FRONT_OF_TEXT"><hp:orgSz width="6600" height="9000"/><hp:curSz width="6600" height="9000"/>` +
    `<hp:sz width="9000" height="6600"/><hp:rotationInfo angle="90" centerX="4500" centerY="3300"/>${floatingPos(19500, 17950)}${fill}</hp:rect>`
  const input = await occlusionFixture([cachedPara(photo(), 1600), cachedPara(rect, 3200)])
  assert.deepEqual(await redPixels(input), [0])
  const { scene } = await renderHwpxPages(input)
  assert.deepEqual(scene.regions.find(r => r.type === "shape")!.regions[0], { page: 1, x: 195, y: 179.5, width: 90, height: 66 })
})

test("Hancom rotated picture — drawn as its curSz frame turned inside the sz box", async () => {
  const pic = `<hp:pic id="p" zOrder="1" textWrap="TOP_AND_BOTTOM"><hp:orgSz width="20000" height="12500"/><hp:curSz width="20000" height="12500"/>` +
    `<hp:sz width="12500" height="20000"/><hp:rotationInfo angle="90" centerX="6250" centerY="10000"/>${floatingPos(10000, 15000)}` +
    `<hc:img binaryItemIDRef="photo"/><hp:imgDim dimwidth="400" dimheight="250"/></hp:pic>`
  const { pageSvgs, scene } = await renderHwpxPages(await occlusionFixture([cachedPara(pic, 1600)]))
  assert.match(pageSvgs.get(1)!, /<g transform="rotate\(90 162\.5 250\)">\s*<use href="#[^"]+" x="62\.5" y="187\.5" width="200" height="125"\/>/)
  assert.deepEqual(scene.regions.find(r => r.type === "image")!.regions[0], { page: 1, x: 100, y: 150, width: 125, height: 200 })
})

test("CURVE segments are drawn through their flattened points (a curve cover is no longer dropped)", async () => {
  const pts = [[0, 0], [9000, 0], [9000, 7500], [0, 7500], [0, 0]]
  const segs = pts.slice(1).map((p, i) => `<hp:seg type="CURVE" x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${p[0]}" y2="${p[1]}"/>`).join("")
  const curve = `<hp:curve id="c" zOrder="5" textWrap="IN_FRONT_OF_TEXT"><hp:orgSz width="9000" height="7500"/><hp:curSz width="9000" height="7500"/>` +
    `<hp:sz width="9000" height="7500"/>${floatingPos(19500, 17500)}${fill}${segs}</hp:curve>`
  const input = await occlusionFixture([cachedPara(photo(), 1600), cachedPara(curve, 3200)])
  assert.deepEqual(await redPixels(input), [0])
  const { scene } = await renderHwpxPages(input)
  assert.ok(!scene.warnings.some(w => /곡선/.test(w)))
})

test("renderingInfo — matrices compose in written order (trans · sca · rot …)", () => {
  const el = createXmlParser().parseFromString(`<hp:curve xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">` +
    `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="13121" e4="0" e5="1" e6="-11521"/><hc:scaMatrix e1="0.920672" e2="0" e3="-1040.862061" e4="0" e5="0.72729" e6="12127.560547"/>${ident("rotMatrix")}</hp:renderingInfo></hp:curve>`, "text/xml").documentElement as unknown as Element
  const m = renderingMatrix(el)!
  // 원점 → 13121 + (-1040.86), -11521 + 12127.56 (위례선 트램 보도자료 노선 곡선)
  assert.ok(Math.abs(m[4] - 12080.14) < 0.01 && Math.abs(m[5] - 606.56) < 0.01)
  assert.equal(m[0], 0.920672)
  assert.equal(m[3], 0.72729)
})

test("scaled group — children land where renderingInfo puts them, not at the unscaled offset", async () => {
  // 최상위 묶음 원본 72000×30000 → 18000×7500 (¼). 덮개는 원본 offset (36000, 0) 의 36000×30000 → 묶음 상자 (9000, 0) 의 9000×7500.
  // 묶음 자리 (105, 175)pt 에 놓으면 덮개가 (195, 175)pt 90×75pt — 빨강을 덮는다. offset 만 더하던 종전 경로는 465pt 로 빗나갔다
  const child = `<hp:rect id="cv" zOrder="0" groupLevel="1"><hp:offset x="36000" y="0"/><hp:orgSz width="36000" height="30000"/><hp:curSz width="9000" height="7500"/>` +
    `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="36000" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.25" e2="0" e3="-27000" e4="0" e5="0.25" e6="0"/>${ident("rotMatrix")}</hp:renderingInfo>` +
    `${fill}</hp:rect>`
  const group = `<hp:container id="g" zOrder="5" textWrap="IN_FRONT_OF_TEXT"><hp:offset x="0" y="0"/><hp:orgSz width="72000" height="30000"/><hp:curSz width="18000" height="7500"/>` +
    `<hp:renderingInfo>${ident("transMatrix")}<hc:scaMatrix e1="0.25" e2="0" e3="0" e4="0" e5="0.25" e6="0"/>${ident("rotMatrix")}</hp:renderingInfo>` +
    `<hp:sz width="18000" height="7500"/>${floatingPos(10500, 17500)}${child}</hp:container>`
  const input = await occlusionFixture([cachedPara(photo(), 1600), cachedPara(group, 3200)])
  assert.deepEqual(await redPixels(input), [0])
  const { scene } = await renderHwpxPages(input)
  assert.deepEqual(scene.regions.find(r => r.type === "shape")!.regions[0], { page: 1, x: 195, y: 175, width: 90, height: 75 })
})

const textBox = (text: string) => `<hp:drawText lastWidth="10000"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run>` +
  `<hp:linesegarray>${seg(0, 9000)}</hp:linesegarray></hp:p></hp:subList></hp:drawText>`

test("text inside a rotated Hancom shape stays inside its frame", async () => {
  const rect = `<hp:rect id="t" zOrder="5" textWrap="IN_FRONT_OF_TEXT"><hp:orgSz width="10000" height="2000"/><hp:curSz width="10000" height="2000"/>` +
    `<hp:sz width="2000" height="10000"/><hp:rotationInfo angle="90" centerX="1000" centerY="5000"/>${floatingPos(20000, 20000)}` +
    `<hp:lineShape style="SOLID"/>${textBox("HELLOWORLD")}</hp:rect>`
  const { scene } = await renderHwpxPages(await occlusionFixture([cachedPara(rect, 1600)]))
  const shape = scene.regions.find(r => r.type === "shape")!.regions[0]
  const para = scene.regions.filter(r => r.type === "paragraph").map(r => r.regions[0]).find(b => b.x >= 150)!
  assert.ok(para.x >= shape.x - 0.5 && para.x + para.width <= shape.x + shape.width + 0.5, JSON.stringify({ shape, para }))
  assert.ok(para.y >= shape.y - 0.5 && para.y + para.height <= shape.y + shape.height + 0.5, JSON.stringify({ shape, para }))
})

test("text in a resized group keeps its own size (only the group's rotation applies)", async () => {
  const child = `<hp:rect id="cv" zOrder="0" groupLevel="1"><hp:offset x="0" y="0"/><hp:orgSz width="4000" height="2000"/><hp:curSz width="4600" height="3200"/>` +
    `<hp:renderingInfo>${ident("transMatrix")}<hc:scaMatrix e1="1.15" e2="0" e3="0" e4="0" e5="1.6" e6="0"/>${ident("rotMatrix")}</hp:renderingInfo>` +
    `<hp:lineShape style="SOLID"/>${textBox("55")}</hp:rect>`
  const group = `<hp:container id="g" zOrder="5" textWrap="IN_FRONT_OF_TEXT"><hp:orgSz width="4000" height="2000"/><hp:curSz width="4600" height="3200"/>` +
    `<hp:renderingInfo>${ident("transMatrix")}<hc:scaMatrix e1="1.15" e2="0" e3="0" e4="0" e5="1.6" e6="0"/>${ident("rotMatrix")}</hp:renderingInfo>` +
    `<hp:sz width="4600" height="3200"/>${floatingPos(20000, 20000)}${child}</hp:container>`
  const { pageSvgs, scene } = await renderHwpxPages(await occlusionFixture([cachedPara(group, 1600)]))
  assert.match(pageSvgs.get(1)!, /<g transform="matrix\(1\.15 0 0 1\.6 [^)]*\)">[\s\S]*?<g transform="scale\(0\.869\d* 0\.625\)">/)
  const shape = scene.regions.find(r => r.type === "shape")!.regions[0]
  assert.deepEqual([shape.width, shape.height], [46, 32])
})

test("text margins of a box in a resized group are not scaled by the group", async () => {
  const at = async (margin: number) => {
    const box = textBox("55").replace("<hp:subList>", `<hp:textMargin left="${margin}" right="${margin}" top="${margin}" bottom="${margin}"/><hp:subList>`)
    const child = `<hp:rect id="cv" zOrder="0" groupLevel="1"><hp:offset x="0" y="0"/><hp:orgSz width="4000" height="2000"/><hp:curSz width="4600" height="3200"/>` +
      `<hp:renderingInfo>${ident("transMatrix")}<hc:scaMatrix e1="1.15" e2="0" e3="0" e4="0" e5="1.6" e6="0"/>${ident("rotMatrix")}</hp:renderingInfo>` +
      `<hp:lineShape style="SOLID"/>${box}</hp:rect>`
    const group = `<hp:container id="g" zOrder="5" textWrap="IN_FRONT_OF_TEXT"><hp:orgSz width="4000" height="2000"/><hp:curSz width="4600" height="3200"/>` +
      `<hp:renderingInfo>${ident("transMatrix")}<hc:scaMatrix e1="1.15" e2="0" e3="0" e4="0" e5="1.6" e6="0"/>${ident("rotMatrix")}</hp:renderingInfo>` +
      `<hp:sz width="4600" height="3200"/>${floatingPos(20000, 20000)}${child}</hp:container>`
    const { scene } = await renderHwpxPages(await occlusionFixture([cachedPara(group, 1600)]))
    return scene.regions.filter(r => r.type === "paragraph").map(r => r.regions[0]).find(b => b.x >= 150)!
  }
  const p0 = await at(0), p1 = await at(283)
  // 안 여백 283 은 배율(1.15·1.6)을 받지 않고 2.83pt 만큼만 글을 옮긴다
  assert.ok(Math.abs(p1.x - p0.x - 2.83) < 0.05 && Math.abs(p1.y - p0.y - 2.83) < 0.05, JSON.stringify({ p0, p1 }))
})

test("tracked deletion markers inside hp:t (Hancom form) hide the deleted text", () => {
  const doc = createXmlParser().parseFromString(`<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
    cachedPara(`<hp:t>KEEP1<hp:deleteBegin Id="1" TcId="1"/>GONE<hp:tab width="500"/><hp:deleteEnd Id="1" TcId="1"/>KEEP2</hp:t>`) +
    cachedPara(`<hp:t>A<hp:deleteBegin Id="2"/>B</hp:t>`) + cachedPara(`<hp:t>C<hp:deleteEnd Id="2"/>D</hp:t>`) + `</hs:sec>`, "text/xml")
  const root = doc.documentElement as unknown as Element
  prepareDeletedRanges(root)
  const ps = [...(root.childNodes as unknown as Element[])].filter(n => n.nodeType === 1)
  const text = (i: number) => buildPara(ps[i]).chars.map(c => c.ch).join("")
  assert.equal(text(0), "KEEP1KEEP2")
  assert.ok(buildPara(ps[0]).chars.every(c => !c.tab))
  // 문단을 건너는 삭제 구간 — 다음 문단의 앞부분도 지운다
  assert.deepEqual([text(1), text(2)], ["A", "D"])
})

