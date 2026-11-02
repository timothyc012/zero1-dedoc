import { test } from "node:test"
import assert from "node:assert/strict"
import { parseSectionXml } from "../src/hwpx/section-walker.js"

const NS = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'

test("들여 써 저장한 HWPX — hp:run 사이 줄바꿈·들여쓰기 공백은 글이 아니다, hp:t 안 공백은 글", () => {
  const xml = `<hs:sec ${NS}>
    <hp:p paraPrIDRef="0">
        <hp:run charPrIDRef="0">
            <hp:t>「벤처투자</hp:t>
        </hp:run>
        <hp:run charPrIDRef="0">
            <hp:t>&#160;</hp:t>
        </hp:run>
        <hp:run charPrIDRef="0">
            <hp:t>촉진에 관한</hp:t>
        </hp:run>
    </hp:p>
</hs:sec>`
  const blocks = parseSectionXml(xml)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].text?.replace(/ /g, " "), "「벤처투자 촉진에 관한")
})
