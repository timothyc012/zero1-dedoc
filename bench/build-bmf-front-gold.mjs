#!/usr/bin/env node
/** Build printed-table gold for BMF pages 1–3 from the official companion XLSX. */
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { xlsxSourceCells } from "./lib/office-pdf-gold.mjs"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const input=join(root,"bench/corpus/office-pdf")
const pdfBytes=await readFile(join(input,"bmf-tax-tables.pdf"))
const workbookBytes=await readFile(join(input,"bmf-tax-tables.xlsx"))
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
const pdfSha="1bbaae9366524c2830b52092b9e6a5f9b9bdb5a801402e48dd9e58d32385c4b2"
const workbookSha="36dd814e82b1066493201069cee7c638f9e753e9ea77fc52fd00a8a7d7f64f80"
if(sha(pdfBytes)!==pdfSha||sha(workbookBytes)!==workbookSha)throw new Error("BMF source hash mismatch")
const sheets=new Map((await xlsxSourceCells(workbookBytes)).map(sheet=>[sheet.name,sheet]))
const specs=[
  {page:1,sheet:"1 Steuerarten",tables:[{headerRows:[4,5],sourceRanges:[[6,49],[51,51]]}]},
  {page:2,sheet:"2 Aufteilung",tables:[{headerRows:[4,5],sourceRanges:[[6,55]]}]},
  {page:3,sheet:"3u4 weitere Angaben",tables:[
    {headerRows:[5,6],sourceRanges:[[7,24]]},
    {headerRows:[27,28],sourceRanges:[[29,52]]},
  ],outsideTableRows:[26]},
]
const labelCols=["A","B","C","D","E"]
const numberCols=["F","G","H","I","J","K"]
function display(raw,decimals) {
  const n=Number(raw)
  if(!Number.isFinite(n)) throw new Error(`Nonfinite BMF numeric source: ${raw}`)
  const multiplier=10**decimals
  const rounded=Math.floor(Math.abs(n)*multiplier+0.5)
  const int=Math.floor(rounded/multiplier)
  const fraction=decimals?","+String(rounded%multiplier).padStart(decimals,"0"):""
  return `${n<0?"-":""}${String(int).replace(/\B(?=(\d{3})+(?!\d))/g,".")}${fraction}`
}
function columnNumber(label){return [...label].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)}
function mergeAt(ref,row) {
  const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref)
  if(!m||row<Number(m[2])||row>Number(m[4]))return null
  const lo=columnNumber(m[1]),hi=columnNumber(m[3])
  return {source:ref,pageColSpan:Number(lo<=5&&hi>=1)+numberCols.filter(col=>columnNumber(col)>=lo&&columnNumber(col)<=hi).length}
}
const pages=specs.map(spec=>{
  const sheet=sheets.get(spec.sheet)
  if(!sheet)throw new Error(`Missing sheet ${spec.sheet}`)
  const cells=new Map(sheet.cells.map(cell=>[cell.address,cell]))
  const at=(col,row)=>cells.get(`${col}${row}`)
  const tables=spec.tables.map((part,index)=>{
    const headers=part.headerRows.map(row=>({sourceRow:row,
      label:labelCols.map(col=>at(col,row)?.value).filter(Boolean).join(" "),
      values:numberCols.map(col=>({source:`${col}${row}`,text:at(col,row)?.value??null})),
      merges:sheet.merges.map(ref=>mergeAt(ref,row)).filter(Boolean),
    }))
    const rows=[]
    for(const [start,end] of part.sourceRanges) for(let row=start;row<=end;row++) {
      const labels=labelCols.map(col=>at(col,row)).filter(Boolean)
      const values=numberCols.map(col=>{
        const cell=at(col,row)
        if(!cell)return {source:`${col}${row}`,raw:null,display:null}
        return {source:cell.address,raw:cell.value,
          display:cell.type==="number"||cell.type==="formula"&&cell.value!==""
            ?display(cell.value,col==="H"||col==="K"?1:0):cell.value,
          sourceType:cell.type}
      })
      if(!labels.length&&values.every(value=>value.raw===null))continue
      rows.push({sourceRow:row,role:values.some(value=>value.raw!==null)?"data":"section",
        label:labels.map(cell=>cell.value).join(" ").replace(/\s+/g," ").trim(),
        labelSources:labels.map(cell=>cell.address),values,
        merges:sheet.merges.map(ref=>mergeAt(ref,row)).filter(Boolean)})
    }
    return {index:index+1,expectedRows:headers.length+rows.length,expectedCols:7,headers,rows}
  })
  const outsideTableRows=(spec.outsideTableRows??[]).map(row=>({sourceRow:row,
    text:[...labelCols,...numberCols].map(col=>at(col,row)?.value).filter(Boolean).join(" ").replace(/\s+/g," ").trim()}))
  return {page:spec.page,sheet:spec.sheet,tables,outsideTableRows}
})
const gold={schema_version:"zero1-bmf-front-gold.v1",pdf_sha256:pdfSha,xlsx_sha256:workbookSha,
  method:"Official workbook source cells and print table regions; numeric F/G/I/J integer, H/K one decimal in German display format",pages}
const output=resolve(process.argv[2]??join(root,"bench/bmf-front-gold.json"))
await writeFile(output,JSON.stringify(gold,null,2)+"\n")
console.log(JSON.stringify({output,pages:pages.map(page=>({page:page.page,tables:page.tables.map(table=>[table.expectedRows,table.expectedCols])}))}))
