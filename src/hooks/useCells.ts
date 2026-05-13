import { useEffect, useState, useCallback, useRef } from 'react'
import { Sheet } from '@fortune-sheet/core'
import { supabase } from '../lib/supabase'

export interface CellData {
  row: number
  col: number
  value: string
  formula?: string
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token}` }
}

export function useCells(sheetId: string) {
  const [cells, setCells] = useState<CellData[]>([])
  const [loading, setLoading] = useState(true)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fetchCells = async () => {
      const headers = await authHeader()
      const res = await fetch(`/api/sheets/${sheetId}/cells`, { headers })
      const data = await res.json()
      setCells(Array.isArray(data) ? data : [])
      setLoading(false)
    }
    fetchCells()
  }, [sheetId])

  // onChange에서 받은 전체 시트 데이터를 DB에 저장 (디바운스 500ms)
  const saveSheetData = useCallback((sheetData: Sheet[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const headers = await authHeader()
      const celldata = sheetData[0]?.celldata ?? []
      for (const cell of celldata) {
        if (cell.v == null) continue
        const value = String(cell.v?.m ?? cell.v?.v ?? '')
        const formula = typeof cell.v?.f === 'string' ? cell.v.f : undefined
        if (!value && !formula) continue
        await fetch(`/api/sheets/${sheetId}/cells`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ row: cell.r, col: cell.c, value, formula }),
        })
      }
    }, 500)
  }, [sheetId])

  return { cells, loading, saveSheetData }
}
