import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL('../../supabase/migrations/006_page_assets_baseline.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')

describe('page asset baseline migration', () => {
  it('preserves existing objects and aborts on schema drift', () => {
    expect(sql).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.page_assets/)
    expect(sql).toMatch(/page_assets column drift/)
    expect(sql).toMatch(/page_assets bucket drift/)
    expect(sql).not.toMatch(/DROP TABLE/i)
    expect(sql).not.toMatch(/DELETE FROM (public\.)?page_assets/i)
  })

  it('blocks browser table access while retaining RLS defense in depth', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.page_assets FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.page_assets TO service_role/)
    expect(sql).toMatch(/CREATE POLICY "page_assets_block_direct_access" ON storage\.objects/)
    expect(sql).toMatch(/AS RESTRICTIVE/)
  })

  it('enforces page and workspace consistency', () => {
    expect(sql).toMatch(/page\.workspace_id <> asset\.workspace_id/)
    expect(sql).toMatch(/CREATE TRIGGER page_assets_scope_integrity/)
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF workspace_id, page_id/)
  })

  it('pins the public bucket limits used by the current editor', () => {
    expect(sql).toMatch(/20971520/)
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(sql).toContain(mime)
    }
    expect(sql).toMatch(/Signed upload URLs are issued by the service-role API/)
  })
})
