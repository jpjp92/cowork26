import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token || token === 'undefined') return res.status(401).json({ error: 'Missing access token' })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: authError?.message ?? 'Invalid access token' })
  }

  if (req.method === 'GET') {
    const { data: memberships, error: membershipsError } = await supabaseAdmin
      .from('sheet_members')
      .select('sheet_id')
      .eq('user_id', user.id)

    if (membershipsError) return res.status(500).json({ error: membershipsError.message })

    const memberSheetIds = memberships?.map(row => row.sheet_id) ?? []
    const query = supabaseAdmin
      .from('sheets')
      .select('id, title, created_at, updated_at, owner_id')
      .order('updated_at', { ascending: false })

    const { data, error } = memberSheetIds.length > 0
      ? await query.or(`owner_id.eq.${user.id},id.in.(${memberSheetIds.join(',')})`)
      : await query.eq('owner_id', user.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { title } = req.body as { title?: string }

    const { data: sheet, error } = await supabaseAdmin
      .from('sheets')
      .insert({ title: title ?? '제목 없음', owner_id: user.id })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })

    const { error: memberError } = await supabaseAdmin.from('sheet_members').insert({
      sheet_id: sheet.id,
      user_id: user.id,
      role: 'editor',
    })

    if (memberError) return res.status(500).json({ error: memberError.message })

    return res.status(201).json(sheet)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query as { id: string }
    const { error } = await supabaseAdmin
      .from('sheets')
      .delete()
      .eq('id', id)
      .eq('owner_id', user.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).end()
  }

  return res.status(405).json({ error: 'Method Not Allowed' })
}
