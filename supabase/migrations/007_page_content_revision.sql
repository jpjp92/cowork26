-- Optimistic concurrency control for page title/content saves.
-- Metadata-only updates do not advance content_revision.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.pages') IS NULL THEN
    RAISE EXCEPTION 'Apply migrations 001 through 006 before migration 007';
  END IF;
END;
$$;

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS content_revision BIGINT NOT NULL DEFAULT 0;

DO $$
DECLARE
  revision_type TEXT;
  revision_nullable TEXT;
  revision_default TEXT;
BEGIN
  SELECT udt_name, is_nullable, column_default
  INTO revision_type, revision_nullable, revision_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pages'
    AND column_name = 'content_revision';

  IF revision_type IS DISTINCT FROM 'int8'
     OR revision_nullable IS DISTINCT FROM 'NO'
     OR revision_default IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION
      'pages.content_revision drift: expected BIGINT NOT NULL DEFAULT 0, got type=%, nullable=%, default=%',
      revision_type, revision_nullable, revision_default;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pages WHERE content_revision < 0) THEN
    RAISE EXCEPTION 'Existing pages contain a negative content_revision';
  END IF;
END;
$$;

ALTER TABLE public.pages
  DROP CONSTRAINT IF EXISTS pages_content_revision_nonnegative;
ALTER TABLE public.pages
  ADD CONSTRAINT pages_content_revision_nonnegative
  CHECK (content_revision >= 0);

CREATE OR REPLACE FUNCTION public.advance_page_content_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.content IS DISTINCT FROM NEW.content THEN
    NEW.content_revision := OLD.content_revision + 1;
  ELSE
    -- Callers cannot advance or rewind revisions through metadata-only updates.
    NEW.content_revision := OLD.content_revision;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pages_content_revision ON public.pages;
CREATE TRIGGER pages_content_revision
  BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.advance_page_content_revision();

-- Page mutations use the server API so the conditional revision check cannot
-- be bypassed with the browser publishable key. Existing SELECT RLS remains.
DROP POLICY IF EXISTS "pages_editor_insert" ON public.pages;
DROP POLICY IF EXISTS "pages_editor_update" ON public.pages;
DROP POLICY IF EXISTS "pages_editor_delete" ON public.pages;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.pages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pages TO service_role;

COMMIT;
