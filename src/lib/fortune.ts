import { CellData } from '../hooks/useCells'

export function cellsToFortune(cells: CellData[]) {
  const celldata = cells.map(c => ({
    r: c.row,
    c: c.col,
    v: {
      v: c.value,
      m: c.value,
      ...(c.formula ? { f: c.formula } : {}),
      ct: { fa: 'General', t: 'g' },
    },
  }))

  return [
    {
      name: 'Sheet1',
      celldata,
      row: 100,
      column: 26,
    },
  ]
}
