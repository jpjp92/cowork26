-- Cowork26 page asset baseline
-- Existing page_assets data is preserved. Unexpected schema or data drift aborts
-- the migration instead of dropping/recreating objects.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NULL
     OR to_regclass('public.workspace_members') IS NULL
     OR to_regclass('public.pages') IS NULL THEN
    RAISE EXCEPTION 'Apply migrations 001 through 005 before migration 006';
  END IF;

  IF to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Supabase Storage schema is required before migration 006';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.page_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  )),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT page_assets_storage_path_key UNIQUE (storage_path)
);

-- A pre-existing table must match the application contract exactly. Adding or
-- coercing columns here could conceal production drift and corrupt metadata.
DO $$
DECLARE
  drift TEXT;
BEGIN
  WITH expected(column_name, udt_name, is_nullable) AS (
    VALUES
      ('id', 'uuid', 'NO'),
      ('workspace_id', 'uuid', 'NO'),
      ('page_id', 'uuid', 'NO'),
      ('storage_path', 'text', 'NO'),
      ('public_url', 'text', 'YES'),
      ('mime_type', 'text', 'NO'),
      ('size_bytes', 'int8', 'NO'),
      ('width', 'int4', 'YES'),
      ('height', 'int4', 'YES'),
      ('created_by', 'uuid', 'YES'),
      ('created_at', 'timestamptz', 'NO'),
      ('deleted_at', 'timestamptz', 'YES')
  ),
  actual AS (
    SELECT column_name, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'page_assets'
  ),
  differences AS (
    SELECT
      COALESCE(expected.column_name, actual.column_name) AS column_name,
      expected.udt_name AS expected_type,
      actual.udt_name AS actual_type,
      expected.is_nullable AS expected_nullable,
      actual.is_nullable AS actual_nullable
    FROM expected
    FULL JOIN actual USING (column_name)
    WHERE expected.column_name IS NULL
       OR actual.column_name IS NULL
       OR expected.udt_name <> actual.udt_name
       OR expected.is_nullable <> actual.is_nullable
  )
  SELECT string_agg(
    format('%s(expected %s/%s, actual %s/%s)',
      column_name,
      COALESCE(expected_type, 'absent'),
      COALESCE(expected_nullable, 'absent'),
      COALESCE(actual_type, 'absent'),
      COALESCE(actual_nullable, 'absent')),
    ', '
  )
  INTO drift
  FROM differences;

  IF drift IS NOT NULL THEN
    RAISE EXCEPTION 'page_assets column drift: %', drift;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'p'
      AND pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) THEN
    RAISE EXCEPTION 'page_assets primary key drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (storage_path)'
  ) THEN
    RAISE EXCEPTION 'page_assets storage_path unique constraint drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL%'
  ) THEN
    RAISE EXCEPTION 'page_assets foreign key drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'page_assets'
      AND column_name = 'id' AND column_default LIKE '%gen_random_uuid()%'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'page_assets'
      AND column_name = 'created_at' AND column_default LIKE '%now()%'
  ) THEN
    RAISE EXCEPTION 'page_assets default value drift';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'c'
      AND pg_get_expr(conbin, conrelid) LIKE '%mime_type%'
      AND pg_get_expr(conbin, conrelid) LIKE '%image/png%'
      AND pg_get_expr(conbin, conrelid) LIKE '%image/jpeg%'
      AND pg_get_expr(conbin, conrelid) LIKE '%image/webp%'
      AND pg_get_expr(conbin, conrelid) LIKE '%image/gif%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'c'
      AND pg_get_expr(conbin, conrelid) LIKE '%size_bytes%> 0%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'c'
      AND pg_get_expr(conbin, conrelid) LIKE '%width%> 0%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.page_assets'::regclass AND contype = 'c'
      AND pg_get_expr(conbin, conrelid) LIKE '%height%> 0%'
  ) THEN
    RAISE EXCEPTION 'page_assets check constraint drift';
  END IF;
END;
$$;

-- Refuse to install the integrity trigger over inconsistent existing rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.page_assets AS asset
    LEFT JOIN public.pages AS page ON page.id = asset.page_id
    WHERE page.id IS NULL OR page.workspace_id <> asset.workspace_id
  ) THEN
    RAISE EXCEPTION 'Existing page_assets contain missing or cross-workspace page references';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.page_assets
    WHERE mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
       OR size_bytes <= 0
       OR (width IS NOT NULL AND width <= 0)
       OR (height IS NOT NULL AND height <= 0)
  ) THEN
    RAISE EXCEPTION 'Existing page_assets violate MIME, size, width, or height constraints';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS page_assets_workspace_id_idx
  ON public.page_assets(workspace_id);
CREATE INDEX IF NOT EXISTS page_assets_page_id_idx
  ON public.page_assets(page_id);
CREATE INDEX IF NOT EXISTS page_assets_created_by_idx
  ON public.page_assets(created_by);
CREATE INDEX IF NOT EXISTS page_assets_active_page_idx
  ON public.page_assets(page_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_page_asset_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  page_workspace_id UUID;
BEGIN
  SELECT workspace_id
  INTO page_workspace_id
  FROM public.pages
  WHERE id = NEW.page_id;

  IF page_workspace_id IS NULL OR page_workspace_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Asset page must belong to the same workspace'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS page_assets_scope_integrity ON public.page_assets;
CREATE TRIGGER page_assets_scope_integrity
  BEFORE INSERT OR UPDATE OF workspace_id, page_id ON public.page_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_page_asset_scope();

ALTER TABLE public.page_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_assets FORCE ROW LEVEL SECURITY;

-- Metadata writes and reads go through authenticated server APIs. Remove the
-- earlier browser CRUD policies if the history SQL was applied manually.
DROP POLICY IF EXISTS "page_assets_member_select" ON public.page_assets;
DROP POLICY IF EXISTS "page_assets_editor_insert" ON public.page_assets;
DROP POLICY IF EXISTS "page_assets_editor_update" ON public.page_assets;
DROP POLICY IF EXISTS "page_assets_editor_delete" ON public.page_assets;

REVOKE ALL ON TABLE public.page_assets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.page_assets TO service_role;

DO $$
DECLARE
  bucket_public BOOLEAN;
  bucket_size BIGINT;
  bucket_mimes TEXT[];
BEGIN
  SELECT public, file_size_limit, allowed_mime_types
  INTO bucket_public, bucket_size, bucket_mimes
  FROM storage.buckets
  WHERE id = 'page_assets';

  IF NOT FOUND THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) VALUES (
      'page_assets',
      'page_assets',
      TRUE,
      20971520,
      ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    );
  ELSIF bucket_public IS DISTINCT FROM TRUE
     OR bucket_size IS DISTINCT FROM 20971520
     OR (SELECT array_agg(value ORDER BY value) FROM unnest(bucket_mimes) AS value)
        IS DISTINCT FROM ARRAY['image/gif', 'image/jpeg', 'image/png', 'image/webp']::TEXT[] THEN
    RAISE EXCEPTION
      'page_assets bucket drift: expected public=true, file_size_limit=20971520, and PNG/JPEG/WebP/GIF MIME allowlist';
  END IF;
END;
$$;

-- Signed upload URLs are issued by the service-role API. No storage.objects
-- mutation policy is required for anon/authenticated roles. Remove only the
-- known legacy policy names; unrelated bucket policies are not touched.
DROP POLICY IF EXISTS "page_assets_member_select" ON storage.objects;
DROP POLICY IF EXISTS "page_assets_editor_insert" ON storage.objects;
DROP POLICY IF EXISTS "page_assets_editor_update" ON storage.objects;
DROP POLICY IF EXISTS "page_assets_editor_delete" ON storage.objects;

DROP POLICY IF EXISTS "page_assets_block_direct_access" ON storage.objects;
CREATE POLICY "page_assets_block_direct_access" ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'page_assets')
  WITH CHECK (bucket_id <> 'page_assets');

COMMIT;
