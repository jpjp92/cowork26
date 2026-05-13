import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const sheetId = req.query.id as string

  const { data: sheet } = await supabaseAdmin
    .from('sheets')
    .select('owner_id')
    .eq('id', sheetId)
    .single()

  if (!sheet || sheet.owner_id !== user.id) return res.status(403).json({ error: 'Forbidden' })

  const { email, role } = req.body as { email: string; role: 'editor' | 'viewer' }

  const { data: users } = await supabaseAdmin.auth.admin.listUsers()
  const invitee = users?.users.find(u => u.email === email)
  if (!invitee) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' })

  const { data, error } = await supabaseAdmin
    .from('sheet_members')
    .upsert(
      { sheet_id: sheetId, user_id: invitee.id, role },
      { onConflict: 'sheet_id,user_id' }
    )
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}
