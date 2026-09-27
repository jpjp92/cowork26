-- Cowork26 personal BYOK credentials and workspace analysis metadata.
-- Provider keys and document source text are never stored in plaintext.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workspaces') IS NULL
     OR to_regclass('public.workspace_members') IS NULL
     OR to_regclass('public.pages') IS NULL THEN
    RAISE EXCEPTION 'Apply migrations 001 through 007 before migration 008';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pages'
      AND column_name = 'content_revision'
      AND udt_name = 'int8'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Migration 007 pages.content_revision is required before migration 008';
  END IF;

  IF to_regclass('public.user_ai_credentials') IS NOT NULL
     OR to_regclass('public.workspace_ai_policies') IS NOT NULL
     OR to_regclass('public.ai_analysis_requests') IS NOT NULL
     OR to_regclass('public.ai_analysis_sources') IS NOT NULL
     OR to_regprocedure('public.touch_ai_updated_at()') IS NOT NULL
     OR to_regprocedure('public.enforce_workspace_ai_policy_owner()') IS NOT NULL
     OR to_regprocedure('public.enforce_ai_analysis_request_scope()') IS NOT NULL
     OR to_regprocedure('public.enforce_ai_analysis_source_scope()') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 008 objects already exist; inspect schema drift instead of overwriting them';
  END IF;
END;
$$;

CREATE TABLE public.user_ai_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini')),
  ciphertext TEXT NOT NULL CHECK (
    char_length(ciphertext) BETWEEN 2 AND 11000
    AND ciphertext ~ '^[A-Za-z0-9_-]+$'
  ),
  nonce TEXT NOT NULL CHECK (nonce ~ '^[A-Za-z0-9_-]{16}$'),
  auth_tag TEXT NOT NULL CHECK (auth_tag ~ '^[A-Za-z0-9_-]{22}$'),
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  key_last_four TEXT NOT NULL CHECK (
    char_length(key_last_four) = 4
    AND key_last_four !~ '[[:cntrl:]]'
  ),
  verified_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_ai_credentials_user_provider_key UNIQUE (user_id, provider)
);

CREATE TABLE public.workspace_ai_policies (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_providers TEXT[] NOT NULL DEFAULT ARRAY['openai', 'gemini']::TEXT[],
  allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['owner', 'editor']::TEXT[],
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_ai_policies_providers_check CHECK (
    cardinality(allowed_providers) BETWEEN 1 AND 2
    AND allowed_providers <@ ARRAY['openai', 'gemini']::TEXT[]
    AND array_position(allowed_providers, NULL) IS NULL
    AND (cardinality(allowed_providers) = 1 OR allowed_providers[1] <> allowed_providers[2])
  ),
  CONSTRAINT workspace_ai_policies_roles_check CHECK (
    cardinality(allowed_roles) BETWEEN 1 AND 2
    AND allowed_roles <@ ARRAY['owner', 'editor']::TEXT[]
    AND array_position(allowed_roles, NULL) IS NULL
    AND (cardinality(allowed_roles) = 1 OR allowed_roles[1] <> allowed_roles[2])
  )
);

CREATE TABLE public.ai_analysis_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  analysis_type TEXT NOT NULL CHECK (
    analysis_type IN ('summary', 'organize', 'analysis', 'question', 'action_items')
  ),
  prompt_template_version INTEGER NOT NULL CHECK (prompt_template_version > 0),
  prompt_hash TEXT NOT NULL CHECK (prompt_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash TEXT NOT NULL CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 1 AND 10),
  source_bytes INTEGER NOT NULL CHECK (source_bytes BETWEEN 1 AND 262144),
  provider_request_id TEXT CHECK (char_length(provider_request_id) BETWEEN 1 AND 512),
  usage_input_tokens INTEGER CHECK (usage_input_tokens >= 0),
  usage_output_tokens INTEGER CHECK (usage_output_tokens >= 0),
  error_code TEXT CHECK (error_code IN (
    'invalid_credential',
    'rate_limited',
    'timeout',
    'provider_unavailable',
    'invalid_output',
    'forbidden',
    'invalid_request',
    'internal_error'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT ai_analysis_requests_creator_idempotency_key
    UNIQUE (created_by, idempotency_key_hash),
  CONSTRAINT ai_analysis_requests_time_order CHECK (
    expires_at > created_at
    AND (started_at IS NULL OR started_at >= created_at)
    AND (completed_at IS NULL OR completed_at >= COALESCE(started_at, created_at))
  ),
  CONSTRAINT ai_analysis_requests_status_time_check CHECK (
    (status = 'pending' AND started_at IS NULL AND completed_at IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed', 'cancelled') AND completed_at IS NOT NULL)
  ),
  CONSTRAINT ai_analysis_requests_error_check CHECK (
    (status = 'failed' AND error_code IS NOT NULL)
    OR (status <> 'failed' AND error_code IS NULL)
  )
);

CREATE TABLE public.ai_analysis_sources (
  request_id UUID NOT NULL REFERENCES public.ai_analysis_requests(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  content_revision BIGINT NOT NULL CHECK (content_revision >= 0),
  source_label TEXT NOT NULL CHECK (source_label ~ '^S([1-9]|10)$'),
  source_order SMALLINT NOT NULL CHECK (source_order BETWEEN 0 AND 9),
  normalized_bytes INTEGER NOT NULL CHECK (normalized_bytes BETWEEN 1 AND 262144),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, page_id),
  CONSTRAINT ai_analysis_sources_label_key UNIQUE (request_id, source_label),
  CONSTRAINT ai_analysis_sources_order_key UNIQUE (request_id, source_order)
);

CREATE INDEX workspace_ai_policies_updated_by_idx
  ON public.workspace_ai_policies(updated_by);
CREATE INDEX ai_analysis_requests_workspace_created_idx
  ON public.ai_analysis_requests(workspace_id, created_at DESC);
CREATE INDEX ai_analysis_requests_creator_created_idx
  ON public.ai_analysis_requests(created_by, created_at DESC);
CREATE INDEX ai_analysis_requests_expiry_idx
  ON public.ai_analysis_requests(expires_at);
CREATE INDEX ai_analysis_sources_page_id_idx
  ON public.ai_analysis_sources(page_id);

CREATE FUNCTION public.touch_ai_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_ai_credentials_updated_at
  BEFORE UPDATE ON public.user_ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_updated_at();

CREATE TRIGGER workspace_ai_policies_updated_at
  BEFORE UPDATE ON public.workspace_ai_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_updated_at();

-- Existing workspaces remain opted out. The creator is recorded only as the
-- bootstrap actor; this insert does not enable AI or transmit any content.
INSERT INTO public.workspace_ai_policies (workspace_id, enabled, updated_by)
SELECT workspace.id, FALSE, workspace.created_by
FROM public.workspaces AS workspace;

CREATE FUNCTION public.enforce_workspace_ai_policy_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members AS member
    WHERE member.workspace_id = NEW.workspace_id
      AND member.user_id = NEW.updated_by
      AND member.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Workspace AI policy may only be changed by an owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_ai_policies_owner
  BEFORE INSERT OR UPDATE OF enabled, allowed_providers, allowed_roles
  ON public.workspace_ai_policies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_workspace_ai_policy_owner();

CREATE FUNCTION public.enforce_ai_analysis_request_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  member_role TEXT;
  policy_enabled BOOLEAN;
  policy_providers TEXT[];
  policy_roles TEXT[];
BEGIN
  SELECT member.role
  INTO member_role
  FROM public.workspace_members AS member
  WHERE member.workspace_id = NEW.workspace_id
    AND member.user_id = NEW.created_by;

  SELECT policy.enabled, policy.allowed_providers, policy.allowed_roles
  INTO policy_enabled, policy_providers, policy_roles
  FROM public.workspace_ai_policies AS policy
  WHERE policy.workspace_id = NEW.workspace_id;

  IF member_role IS NULL
     OR policy_enabled IS DISTINCT FROM TRUE
     OR NOT (NEW.provider = ANY(policy_providers))
     OR NOT (member_role = ANY(policy_roles)) THEN
    RAISE EXCEPTION 'AI analysis is not allowed for this user, workspace, role, or provider'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_analysis_requests_scope
  BEFORE INSERT OR UPDATE OF workspace_id, created_by, provider
  ON public.ai_analysis_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_analysis_request_scope();

CREATE FUNCTION public.enforce_ai_analysis_source_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_workspace_id UUID;
  page_workspace_id UUID;
  page_revision BIGINT;
BEGIN
  SELECT request.workspace_id
  INTO request_workspace_id
  FROM public.ai_analysis_requests AS request
  WHERE request.id = NEW.request_id;

  SELECT page.workspace_id, page.content_revision
  INTO page_workspace_id, page_revision
  FROM public.pages AS page
  WHERE page.id = NEW.page_id;

  IF request_workspace_id IS NULL
     OR page_workspace_id IS NULL
     OR request_workspace_id <> page_workspace_id THEN
    RAISE EXCEPTION 'Analysis source page must belong to the request workspace'
      USING ERRCODE = '23514';
  END IF;

  IF page_revision <> NEW.content_revision THEN
    RAISE EXCEPTION 'Analysis source revision is stale'
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_analysis_sources_scope
  BEFORE INSERT OR UPDATE OF request_id, page_id, content_revision
  ON public.ai_analysis_sources
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_analysis_source_scope();

ALTER TABLE public.user_ai_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_ai_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_ai_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_sources FORCE ROW LEVEL SECURITY;

-- All access is mediated by authenticated server APIs. In particular, a user
-- cannot select their own ciphertext or bypass ownership checks with Supabase's
-- browser key. service_role bypasses RLS, so every API must still compare the
-- freshly authenticated user ID with the requested owner and workspace member.
REVOKE ALL ON TABLE public.user_ai_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.workspace_ai_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_analysis_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_analysis_sources FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_ai_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_ai_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_analysis_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_analysis_sources TO service_role;

REVOKE ALL ON FUNCTION public.touch_ai_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_workspace_ai_policy_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_ai_analysis_request_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_ai_analysis_source_scope() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.touch_ai_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_workspace_ai_policy_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_ai_analysis_request_scope() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_ai_analysis_source_scope() TO service_role;

COMMIT;
