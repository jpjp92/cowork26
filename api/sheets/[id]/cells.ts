import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const sheetId = req.query.id as string

  const { data: member } = await supabaseAdmin
    .from('sheet_members')
    .select('role')
    .eq('sheet_id', sheetId)
    .eq('user_id', user.id)
    .single()

  if (!member) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('cells')
      .select('row, col, value, formula, updated_by, updated_at')
      .eq('sheet_id', sheetId)

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'PUT') {
    if (member.role !== 'editor') return res.status(403).json({ error: 'Read only' })

    const { row, col, value, formula } = req.body as {
      row: number
      col: number
      value: string
      formula?: string
    }

    const { data, error } = await supabaseAdmin
      .from('cells')
      .upsert(
        {
          sheet_id: sheetId,
          row,
          col,
          value,
          formula: formula ?? null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sheet_id,row,col' }
      )
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  return res.status(405).json({ error: 'Method Not Allowed' })
}
