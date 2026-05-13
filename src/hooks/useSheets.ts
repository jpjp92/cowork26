import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Sheet {
  id: string
  title: string
  owner_id: string
  created_at: string
  updated_at: string
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${data.session?.access_token}` }
}

export function useSheets() {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSheets = useCallback(async () => {
    const headers = await authHeader()
    const res = await fetch('/api/sheets', { headers })
    const data = await res.json()
    setSheets(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSheets() }, [fetchSheets])

  const createSheet = useCallback(async (title: string): Promise<Sheet> => {
    const headers = await authHeader()
    const res = await fetch('/api/sheets', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    const sheet = await res.json()
    setSheets(prev => [sheet, ...prev])
    return sheet
  }, [])

  const deleteSheet = useCallback(async (id: string) => {
    const headers = await authHeader()
    await fetch(`/api/sheets?id=${id}`, { method: 'DELETE', headers })
    setSheets(prev => prev.filter(s => s.id !== id))
  }, [])

  return { sheets, loading, createSheet, deleteSheet, refetch: fetchSheets }
}
