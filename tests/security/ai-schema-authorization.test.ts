import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL('../../supabase/migrations/008_ai_document_editing.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')
const tables = [
  'user_ai_credentials',
  'workspace_ai_policies',
  'ai_analysis_requests',
  'ai_analysis_sources',
] as const

describe('AI document editing migration authorization', () => {
  it('is transactional, forward-only, and requires the revision baseline', () => {
    expect(sql).toMatch(/^--[\s\S]*\nBEGIN;/)
    expect(sql.trimEnd()).toMatch(/COMMIT;$/)
    expect(sql).toContain("Migration 007 pages.content_revision is required")
    expect(sql).toContain('inspect schema drift instead of overwriting them')
    expect(sql).toContain("to_regprocedure('public.touch_ai_updated_at()')")
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/)
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/i)
  })

  it('creates the four bounded metadata tables without plaintext document fields', () => {
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table} \\(`))
    }

    expect(sql).toMatch(/provider IN \('openai', 'gemini'\)/)
    expect(sql).toMatch(/source_count BETWEEN 1 AND 10/)
    expect(sql).toMatch(/source_bytes BETWEEN 1 AND 262144/)
    expect(sql).toMatch(/normalized_bytes BETWEEN 1 AND 262144/)
    expect(sql).toMatch(/idempotency_key_hash TEXT NOT NULL/)

    const sourceDefinition = sql.match(
      /CREATE TABLE public\.ai_analysis_sources \(([\s\S]*?)\n\);/,
    )?.[1]
    expect(sourceDefinition).toBeDefined()
    expect(sourceDefinition).not.toMatch(/content\s+(?:TEXT|JSONB)|prompt|result|response|raw/i)
  })

  it('removes all browser grants and exposes no browser policies', () => {
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
      expect(sql).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`,
      )
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role`,
      )
    }
    expect(sql).not.toMatch(/CREATE POLICY/)
  })

  it('binds credentials to their owner and keeps encryption metadata constrained', () => {
    expect(sql).toMatch(/user_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/UNIQUE \(user_id, provider\)/)
    expect(sql).toMatch(/nonce ~ '\^\[A-Za-z0-9_-\]\{16\}\$'/)
    expect(sql).toMatch(/auth_tag ~ '\^\[A-Za-z0-9_-\]\{22\}\$'/)
    expect(sql).toMatch(/key_version INTEGER NOT NULL CHECK \(key_version > 0\)/)
  })

  it('rejects non-owner policy changes and disallowed analysis actors', () => {
    expect(sql).toMatch(/CREATE TRIGGER workspace_ai_policies_owner/)
    expect(sql).toMatch(/member\.role = 'owner'/)
    expect(sql).toContain('Workspace AI policy may only be changed by an owner')
    expect(sql).toMatch(/CREATE TRIGGER ai_analysis_requests_scope/)
    expect(sql).toMatch(/policy_enabled IS DISTINCT FROM TRUE/)
    expect(sql).toMatch(/NEW\.provider = ANY\(policy_providers\)/)
    expect(sql).toMatch(/member_role = ANY\(policy_roles\)/)
  })

  it('rejects cross-workspace and stale page sources', () => {
    expect(sql).toMatch(/CREATE TRIGGER ai_analysis_sources_scope/)
    expect(sql).toMatch(/request_workspace_id <> page_workspace_id/)
    expect(sql).toMatch(/page_revision <> NEW\.content_revision/)
    expect(sql).toContain("USING ERRCODE = '40001'")
  })

  it('uses explicit cascade and nullable audit delete behavior', () => {
    expect(sql).toMatch(/workspace_id UUID PRIMARY KEY REFERENCES public\.workspaces\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/updated_by UUID REFERENCES auth\.users\(id\) ON DELETE SET NULL/)
    expect(sql).toMatch(/request_id UUID NOT NULL REFERENCES public\.ai_analysis_requests\(id\) ON DELETE CASCADE/)
    expect(sql).toMatch(/page_id UUID NOT NULL REFERENCES public\.pages\(id\) ON DELETE CASCADE/)
  })

  it('revokes direct execution of every trigger helper', () => {
    for (const fn of [
      'touch_ai_updated_at',
      'enforce_workspace_ai_policy_owner',
      'enforce_ai_analysis_request_scope',
      'enforce_ai_analysis_source_scope',
    ]) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated`,
      )
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}() TO service_role`)
    }
  })
})
