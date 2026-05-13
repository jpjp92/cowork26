import { useRef, useCallback } from 'react'
import { Workbook, WorkbookInstance } from '@fortune-sheet/react'
import { Op, Sheet } from '@fortune-sheet/core'
import '@fortune-sheet/react/dist/index.css'
import { useCells } from '../hooks/useCells'
import { useRealtime } from '../hooks/useRealtime'
import { cellsToFortune } from '../lib/fortune'

interface SheetMeta {
  id: string
  title: string
}

interface Props {
  sheet: SheetMeta
}

export default function SheetEditor({ sheet }: Props) {
  const { cells, loading, saveSheetData } = useCells(sheet.id)
  const workbookRef = useRef<WorkbookInstance>(null)

  const handleRemoteOp = useCallback((ops: Op[]) => {
    workbookRef.current?.applyOp(ops)
  }, [])

  const { broadcastOps } = useRealtime(sheet.id, handleRemoteOp)

  const handleOp = useCallback((ops: Op[]) => {
    broadcastOps(ops)
  }, [broadcastOps])

  const handleChange = useCallback((data: Sheet[]) => {
    saveSheetData(data)
  }, [saveSheetData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        데이터 불러오는 중...
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 56px)' }}>
      <Workbook
        ref={workbookRef}
        data={cellsToFortune(cells)}
        onOp={handleOp}
        onChange={handleChange}
        showToolbar={true}
        showFormulaBar={true}
        showSheetTabs={false}
      />
    </div>
  )
}
