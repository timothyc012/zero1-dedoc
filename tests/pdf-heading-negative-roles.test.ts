import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { refineLeadDocumentTitleRoles } from "../src/pdf/heading-demote.js"
import type { IRBlock } from "../src/types.js"

const block=(type:IRBlock["type"],text:string,level:number|undefined,pageNumber:number,x:number,y:number,width:number,fontSize:number):IRBlock=>({
  type,text,...(level?{level}:{}),pageNumber,
  style:{fontName:"same-face",fontSize},bbox:{page:pageNumber,x,y,width,height:fontSize},
})

describe("PDF lead title roles",()=>{
  it("keeps the complete title above a press statement and lowers later smaller sections",()=>{
    const blocks=[
      block("heading","Pressekonferenz",1,1,68,726,146,19),
      block("heading","Bruttoinlandsprodukt 2025",1,1,68,694,237,19),
      block("paragraph","für Deutschland",undefined,1,309,694,138,19),
      block("paragraph","– Es gilt das gesprochene Wort –",undefined,1,68,608,162,11),
      block("heading","4. Die privaten Haushalte konsumierten wieder mehr",1,6,68,722,398,11),
    ]
    refineLeadDocumentTitleRoles(blocks,new Map([[1,842],[6,842]]))
    assert.equal(blocks[0].type,"paragraph")
    assert.equal(blocks[1].text,"Bruttoinlandsprodukt 2025 für Deutschland")
    assert.equal(blocks[1].level,1)
    assert.equal(blocks[2].text,"– Es gilt das gesprochene Wort –")
    assert.equal(blocks[3].level,2)
  })

  it("treats a short masthead and intervening date as context for the real title",()=>{
    const blocks=[
      block("heading","Pressemitteilung",1,1,71,685,161,20),
      block("heading","26. Februar 2026",2,1,71,644,111,14),
      block("heading","Geldmengenentwicklung im Euroraum: Januar 2026",1,1,71,513,372,20),
      block("paragraph","Die Jahreswachstumsrate stieg.",undefined,1,71,400,300,10),
      block("heading","Komponenten der weit gefassten Geldmenge M3",1,1,71,274,348,16),
      block("heading","Gegenposten der weit gefassten Geldmenge M3",1,3,71,690,344,16),
    ]
    refineLeadDocumentTitleRoles(blocks,new Map([[1,824],[3,824]]))
    assert.equal(blocks[0].type,"paragraph")
    assert.equal(blocks[2].level,1)
    assert.deepEqual(blocks.filter(item=>item.text?.startsWith("Komponenten")||item.text?.startsWith("Gegenposten")).map(item=>item.level),[2,2])
  })

  it("does not merge unlike fonts or demote same-size section titles after body text",()=>{
    const blocks=[
      block("heading","Independent title",1,1,70,700,200,20),
      block("paragraph","lowercase body",undefined,1,275,700,120,10),
      block("paragraph","A paragraph separates the sections.",undefined,1,70,590,320,10),
      block("heading","Another full-size section",1,1,70,450,250,20),
      block("paragraph","Dahyun Kim<sup>∗</sup>",undefined,1,70,410,180,10),
    ]
    refineLeadDocumentTitleRoles(blocks,new Map([[1,842]]))
    assert.equal(blocks[0].level,1)
    assert.equal(blocks[0].text,"Independent title")
    assert.equal(blocks[3].level,1)
    assert.equal(blocks[4].type,"paragraph")
  })

  it("joins a lowercase same-line fragment even if an earlier pass marked it a heading",()=>{
    const blocks=[
      block("heading","Pressekonferenz",1,1,68,726,146,19),
      block("heading","Bruttoinlandsprodukt 2025",1,1,68,694,237,19),
      block("heading","für Deutschland",3,1,309,694,138,19),
    ]
    refineLeadDocumentTitleRoles(blocks,new Map([[1,842]]))
    assert.equal(blocks[1].text,"Bruttoinlandsprodukt 2025 für Deutschland")
    assert.equal(blocks.length,2)
  })

  it("keeps a numbered chapter marker above its full-size chapter title",()=>{
    const blocks=[
      block("heading","Chapter 3",1,1,70,720,125,20),
      block("heading","Numerical differentiation",1,1,70,680,300,20),
    ]
    refineLeadDocumentTitleRoles(blocks,new Map([[1,842]]))
    assert.equal(blocks[0].level,1)
    assert.equal(blocks[1].level,1)
  })

  it("does not use an all-caps institution wordmark as H1 above a larger title",()=>{
    const blocks=[
      block("heading","EUROPÄISCHE ZENTRALBANK",1,1,280,780,210,11),
      block("heading","Geldmengenentwicklung im Euroraum",1,1,70,650,390,20),
    ]
    refineLeadDocumentTitleRoles(blocks,new Map([[1,824]]))
    assert.equal(blocks[0].type,"paragraph")
    assert.equal(blocks[1].level,1)
  })
})
