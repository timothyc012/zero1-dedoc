/** Pure BMF page scorer: structure, displayed values, merged sections, and footer placement. */
const tokenPattern = /(?<!\w)[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?|(?<!\w)x(?!\w)/g
const counter = values => {
  const counts = new Map()
  for(const value of values) counts.set(value,(counts.get(value)??0)+1)
  return counts
}
const tokens = text => String(text??"").match(tokenPattern)??[]
const textKey = value => String(value??"").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"")
const logicalCells = row => {
  const cells = []
  for(const cell of row??[]) {
    cells.push(cell)
    for(let i=1;i<(cell.colSpan??1);i++) cells.push(null)
  }
  return cells
}

export function scoreBmfPage(page, blocks) {
  const tables = blocks.filter(block=>block.type==="table"&&block.table)
  const expectedRows = page.rows.length+1
  const candidate = tables.find(block=>block.table.rows===expectedRows&&block.table.cols===page.printedColumnCount)
  const expectedValues = page.rows.flatMap(row=>row.values.map(cell=>cell.display).filter(value=>value!==null))
  const outputText = blocks.flatMap(block=>block.type==="table"&&block.table
    ? block.table.cells.flat().map(cell=>cell.text)
    : [block.text??""]).join(" ")
  const available = counter(tokens(outputText))
  let exactValues = 0
  for(const value of expectedValues) if((available.get(value)??0)>0) { available.set(value,available.get(value)-1); exactValues++ }
  const footerInsideTable = tables.some(block=>block.table.cells.flat().some(cell=>/Seite\s+\d+\s+von\s+\d+/i.test(cell.text)))
  const expectedFullSpanRows = page.rows.filter(row=>row.role==="section").length
  const outputFullSpanRows = candidate?.table.cells.flat().filter(cell=>cell.colSpan===page.printedColumnCount).length??null
  let alignedValueCells = 0, alignedLabels = 0, alignedSectionSpans = 0, alignedHeaderCells = 0
  if(candidate) {
    const header = logicalCells(candidate.table.cells[0])
    alignedHeaderCells = page.printedColumns.reduce((n,column,index)=>n+Number(textKey(header[index]?.text)===textKey(column.text)),0)
    for(const [rowIndex,sourceRow] of page.rows.entries()) {
      const outputRow = logicalCells(candidate.table.cells[rowIndex+1])
      if(textKey(outputRow[0]?.text)===textKey(sourceRow.label)) alignedLabels++
      if(sourceRow.role==="section" && outputRow[0]?.colSpan===page.printedColumnCount) alignedSectionSpans++
      for(const [colIndex,value] of sourceRow.values.entries()) {
        if(value.display!==null && String(outputRow[colIndex+1]?.text??"").trim()===value.display) alignedValueCells++
      }
    }
  }
  return {page:page.page,expectedRows,expectedCols:page.printedColumnCount,
    tableShapes:tables.map(block=>[block.table.rows,block.table.cols]),
    exactFullTable:!!candidate,expectedDisplayValues:expectedValues.length,exactDisplayValues:exactValues,
    valueRecall:expectedValues.length?exactValues/expectedValues.length:1,
    alignedValueCells,alignedLabels,alignedHeaderCells,alignedSectionSpans,
    expectedFullSpanRows,outputFullSpanRows,footerInsideTable,
    fullCellGoldPass:!!candidate&&alignedValueCells===expectedValues.length&&
      alignedLabels===page.rows.length&&alignedHeaderCells===page.printedColumnCount&&
      alignedSectionSpans===expectedFullSpanRows&&outputFullSpanRows===expectedFullSpanRows&&
      !footerInsideTable }
}
