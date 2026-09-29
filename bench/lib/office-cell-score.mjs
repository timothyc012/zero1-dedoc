/** Compare independent Office source cells with opt-in parser source metadata. */
export function scoreOfficeCells(sourceSheets, blocks) {
  let sourceCells=0,addressMatched=0,typeMatched=0,rawMatched=0
  let sourceMergeRanges=0,eligibleMergeRanges=0,mergeRangesMatched=0
  let dateFormatted=0,displayDiffersFromRaw=0
  const missing=[]
  const outputBySheet=new Map()
  for(const block of blocks) if(block.type==="table"&&block.table) {
    let map=outputBySheet.get(block.pageNumber)
    if(!map){map=new Map();outputBySheet.set(block.pageNumber,map)}
    for(const cell of block.table.cells.flat()) if(cell.sourceCell) map.set(cell.sourceCell.address,cell)
  }
  for(const sheet of sourceSheets) {
    const output=outputBySheet.get(sheet.number)??new Map()
    const sources=new Map(sheet.cells.map(cell=>[cell.address,cell]))
    sourceMergeRanges+=sheet.merges.length
    for(const range of sheet.merges) {
      const anchor=range.split(":")[0]
      if(!sources.has(anchor))continue
      eligibleMergeRanges++
      if(output.get(anchor)?.sourceCell?.mergeRange===range)mergeRangesMatched++
    }
    for(const source of sheet.cells) {
      sourceCells++
      const result=output.get(source.address)
      if(!result){if(missing.length<12)missing.push(`${sheet.name}!${source.address}`);continue}
      addressMatched++
      if(result.sourceCell.storedType===source.type)typeMatched++
      const expectedRaw=source.type==="formula"&&!source.hasCachedValue?null:source.value
      if(result.sourceCell.rawValue===expectedRaw)rawMatched++
      if(result.sourceCell.dateFormatted)dateFormatted++
      if(result.text!==source.value)displayDiffersFromRaw++
    }
  }
  return {sourceCells,addressMatched,typeMatched,rawMatched,
    sourceMergeRanges,eligibleMergeRanges,mergeRangesMatched,
    dateFormatted,displayDiffersFromRaw,missingExamples:missing,
    passed:addressMatched===sourceCells&&typeMatched===sourceCells&&rawMatched===sourceCells&&
      mergeRangesMatched===eligibleMergeRanges}
}
