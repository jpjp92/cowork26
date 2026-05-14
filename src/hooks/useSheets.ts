import { useEffect, useState, useCallback } from 'react'
export interface Sheet {
  id: string
  title: string
  owner_id: string
  created_at: string
  updated_at: string
}

function authHeader(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` }
}

async function responseError(res: Response, fallback: string) {
  try {
    const data = await res.json()
    return new Error(data?.error ? `${fallback}: ${data.error}` : fallback)
  } catch {
    return new Error(fallback)
  }
}

export function useSheets(accessToken: string) {
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchSheets = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const headers = authHeader(accessToken)
      const res = await fetch('/api/sheets', { headers })
      if (!res.ok) {
        throw await responseError(res, `시트 목록을 불러오지 못했습니다. (${res.status})`)
      }

      const data = await res.json()
      setSheets(Array.isArray(data) ? data : [])
    } catch (err) {
      setSheets([])
      setError(err instanceof Error ? err.message : '시트 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => { fetchSheets() }, [fetchSheets])

  const createSheet = useCallback(async (title: string): Promise<Sheet> => {
    setError('')
    const headers = authHeader(accessToken)
    const res = await fetch('/api/sheets', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw await responseError(res, `시트를 만들지 못했습니다. (${res.status})`)

    const sheet = await res.json()
    setSheets(prev => [sheet, ...prev])
    return sheet
  }, [accessToken])

  const deleteSheet = useCallback(async (id: string) => {
    setError('')
    const headers = authHeader(accessToken)
    const res = await fetch(`/api/sheets?id=${id}`, { method: 'DELETE', headers })
    if (!res.ok) throw await responseError(res, `시트를 삭제하지 못했습니다. (${res.status})`)

    setSheets(prev => prev.filter(s => s.id !== id))
  }, [accessToken])

  return { sheets, loading, error, createSheet, deleteSheet, refetch: fetchSheets }
}
