import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { renderingMatrix, type Affine } from "../src/render/shape-geometry.js"

// 묶음 안 270° 회전 사진(세로 스캔 59580×84180)의 renderingInfo — 실문서 값 그대로
const xml = `<hp:pic xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"><hp:renderingInfo>` +
  `<hc:transMatrix e1="1" e2="0" e3="2887" e4="0" e5="1" e6="-14415"/>` +
  `<hc:scaMatrix e1="0.555737" e2="0" e3="-1282.587036" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>` +
  `<hc:scaMatrix e1="0.233115" e2="0" e3="2679" e4="0" e5="0.254478" e6="14128"/><hc:rotMatrix e1="0" e2="1" e3="-17015" e4="-1" e5="0" e6="30983"/>` +
  `</hp:renderingInfo></hp:pic>`
const at = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

describe("render: 묶음 안 개체 renderingInfo 의 크기·회전 짝", () => {
  it("짝마다 크기를 먼저 걸고 돌린다 — 사진이 묶음 틀(11905×13889)을 꽉 채운다", () => {
    const m = renderingMatrix(createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element)!
    const pts = [at(m, 0, 0), at(m, 59580, 0), at(m, 0, 84180), at(m, 59580, 84180)]
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    assert.ok(Math.abs(Math.min(...xs)) < 2 && Math.abs(Math.max(...xs) - 11905) < 2, `x ${Math.min(...xs)}~${Math.max(...xs)}`)
    assert.ok(Math.abs(Math.min(...ys)) < 2 && Math.abs(Math.max(...ys) - 13889) < 2, `y ${Math.min(...ys)}~${Math.max(...ys)}`)
  })
})
