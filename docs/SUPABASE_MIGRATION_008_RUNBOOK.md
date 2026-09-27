# Supabase migration 008 실행 안내

대상 migration: `supabase/migrations/008_ai_document_editing.sql`

이 migration은 개인 OpenAI/Gemini API key의 암호화 저장 공간, workspace AI opt-in 정책, 분석 요청·출처 metadata를 추가한다. API key 평문, prompt, 문서 원문, provider raw 응답은 저장하지 않는다.

## 현재 실행 여부

아직 Supabase에서 실행하지 않는다. 먼저 이 branch의 자동 테스트와 migration 검토를 마친 뒤 Preview/Test Supabase에 적용한다. 기존 페이지와 workspace 데이터는 수정하지 않지만, 기존 workspace마다 `enabled=false` 정책 한 행을 생성한다.

main branch 코드는 새 테이블을 사용하지 않으므로 migration을 먼저 적용해도 기존 기능에는 영향이 없다. 단, Preview/Test 검증 전 Production 적용은 금지한다.

## 1. 실행 전 확인

Supabase SQL Editor에서 다음 읽기 전용 쿼리를 실행한다.

```sql
SELECT
  to_regclass('public.workspaces') AS workspaces,
  to_regclass('public.workspace_members') AS workspace_members,
  to_regclass('public.pages') AS pages,
  (
    SELECT jsonb_build_object(
      'type', udt_name,
      'nullable', is_nullable,
      'default', column_default
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pages'
      AND column_name = 'content_revision'
  ) AS content_revision,
  jsonb_build_object(
    'user_ai_credentials', to_regclass('public.user_ai_credentials'),
    'workspace_ai_policies', to_regclass('public.workspace_ai_policies'),
    'ai_analysis_requests', to_regclass('public.ai_analysis_requests'),
    'ai_analysis_sources', to_regclass('public.ai_analysis_sources'),
    'touch_ai_updated_at', to_regprocedure('public.touch_ai_updated_at()'),
    'enforce_workspace_ai_policy_owner',
      to_regprocedure('public.enforce_workspace_ai_policy_owner()'),
    'enforce_ai_analysis_request_scope',
      to_regprocedure('public.enforce_ai_analysis_request_scope()'),
    'enforce_ai_analysis_source_scope',
      to_regprocedure('public.enforce_ai_analysis_source_scope()')
  ) AS migration_008_objects,
  (
    SELECT count(*)
    FROM public.workspaces AS workspace
    LEFT JOIN public.workspace_members AS member
      ON member.workspace_id = workspace.id
     AND member.user_id = workspace.created_by
     AND member.role = 'owner'
    WHERE member.user_id IS NULL
  ) AS creator_owner_drift_count;
```

기대 결과:

- `workspaces`, `workspace_members`, `pages`가 모두 존재한다.
- `content_revision`은 `int8`, `NO`, default `0`이다.
- `migration_008_objects`의 table·function 값은 모두 `null`이다.
- `creator_owner_drift_count`는 가능하면 `0`이어야 한다. 0이 아니어도 migration은 disabled policy만 backfill하므로 실행은 가능하지만, 해당 workspace의 현재 owner 상태를 먼저 확인한다.

네 AI table 중 하나라도 이미 존재하면 migration을 실행하지 말고 schema 결과를 공유한다. migration은 예상하지 못한 기존 객체를 덮어쓰지 않고 중단하도록 설계되어 있다.

## 2. 적용

Preview/Test Supabase SQL Editor에서 아래 파일 전체를 `BEGIN;`부터 `COMMIT;`까지 한 번에 실행한다.

```text
supabase/migrations/008_ai_document_editing.sql
```

중간 statement만 골라 실행하지 않는다. 오류가 발생하면 transaction 전체가 rollback되므로 같은 SQL을 임의 수정하거나 재실행하지 말고 오류 전문을 공유한다.

## 3. 적용 후 검증

아래 쿼리를 한 번에 실행한다.

```sql
WITH ai_tables(table_name) AS (
  VALUES
    ('user_ai_credentials'),
    ('workspace_ai_policies'),
    ('ai_analysis_requests'),
    ('ai_analysis_sources')
),
rls AS (
  SELECT
    cls.relname AS table_name,
    cls.relrowsecurity AS rls_enabled,
    cls.relforcerowsecurity AS force_rls
  FROM pg_class AS cls
  JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
  WHERE ns.nspname = 'public'
    AND cls.relname IN (SELECT table_name FROM ai_tables)
),
browser_grants AS (
  SELECT count(*) AS grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (SELECT table_name FROM ai_tables)
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
),
service_grants AS (
  SELECT table_name, array_agg(privilege_type ORDER BY privilege_type) AS privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (SELECT table_name FROM ai_tables)
    AND grantee = 'service_role'
    AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  GROUP BY table_name
),
policies AS (
  SELECT count(*) AS policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (SELECT table_name FROM ai_tables)
),
triggers AS (
  SELECT event_object_table AS table_name,
         trigger_name,
         array_agg(event_manipulation ORDER BY event_manipulation) AS events
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table IN (SELECT table_name FROM ai_tables)
  GROUP BY event_object_table, trigger_name
)
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', ai_tables.table_name,
        'rls_enabled', rls.rls_enabled,
        'force_rls', rls.force_rls,
        'service_crud', service_grants.privileges
      ) ORDER BY ai_tables.table_name
    )
    FROM ai_tables
    LEFT JOIN rls USING (table_name)
    LEFT JOIN service_grants USING (table_name)
  ),
  'browser_grant_count', (SELECT grant_count FROM browser_grants),
  'policy_count', (SELECT policy_count FROM policies),
  'triggers', (
    SELECT jsonb_agg(to_jsonb(triggers) ORDER BY table_name, trigger_name)
    FROM triggers
  ),
  'workspace_count', (SELECT count(*) FROM public.workspaces),
  'disabled_policy_count', (
    SELECT count(*) FROM public.workspace_ai_policies WHERE enabled = FALSE
  ),
  'enabled_policy_count', (
    SELECT count(*) FROM public.workspace_ai_policies WHERE enabled = TRUE
  ),
  'credential_count', (SELECT count(*) FROM public.user_ai_credentials),
  'analysis_request_count', (SELECT count(*) FROM public.ai_analysis_requests),
  'analysis_source_count', (SELECT count(*) FROM public.ai_analysis_sources)
) AS migration_008_verification;
```

기대 결과:

- 네 table 모두 `rls_enabled=true`, `force_rls=true`
- 각 table의 `service_crud`: `DELETE`, `INSERT`, `SELECT`, `UPDATE`
- `browser_grant_count=0`
- `policy_count=0`: 브라우저가 ciphertext나 분석 metadata를 직접 조회할 policy가 없음
- trigger 5개: credential/policy updated time, policy owner, request scope, source scope
- `workspace_count`와 `disabled_policy_count`가 같음
- `enabled_policy_count=0`
- 최초 적용 직후 credential/request/source count는 모두 `0`

검증 결과가 다르면 API 구현으로 넘어가지 않는다.

## 4. 보안 동작 확인 범위

migration 자체가 다음을 강제한다.

- `anon`/`authenticated`/`PUBLIC`은 네 table을 직접 SELECT/INSERT/UPDATE/DELETE할 수 없다.
- credential은 `(user_id, provider)`당 하나이고 사용자 삭제 시 함께 삭제된다.
- policy 변경 actor는 해당 workspace의 현재 owner여야 한다.
- 분석 요청 creator는 현재 member이고 policy에 허용된 owner/editor여야 한다.
- disabled policy, viewer, 제거된 member, 허용되지 않은 provider는 새 요청을 만들 수 없다.
- source page와 request workspace가 다르면 거부한다.
- source의 `content_revision`이 현재 page revision과 다르면 stale로 거부한다.
- source table에는 page ID, revision, opaque label, 순서, byte 수만 저장한다.

service role은 RLS를 우회하므로 이후 API도 fresh authenticated user ID, credential ownership, membership, role을 매 요청마다 명시적으로 검사해야 한다.

## 5. Vercel 설정

이 migration 적용만으로는 Vercel 변경이 필요하지 않다. 실제 credential API를 연결하는 Task 7 배포 전에 다음 값을 환경별로 분리해 Sensitive 값으로 설정한다.

```text
AI_CREDENTIAL_ENCRYPTION_KEY_V1=<32-byte random value encoded as Base64>
AI_FEATURE_ENABLED=false
AI_OPENAI_ENABLED=false
AI_GEMINI_ENABLED=false
AI_WORKSPACE_ANALYSIS_ENABLED=false
```

어떤 값에도 `NEXT_PUBLIC_` 접두어를 붙이지 않는다. Preview와 Production은 서로 다른 암호화 key와 Supabase project를 사용한다.

## 6. 실패 및 복구

- migration 실행 중 오류: transaction이 rollback되므로 생성된 일부 table을 수동 삭제하지 않는다.
- 적용 후 앱 이상: feature flag를 계속 `false`로 유지한다. 기존 앱은 새 table을 사용하지 않는다.
- 검증 불일치: table/policy/grant를 Dashboard에서 즉석 수정하지 말고 forward migration을 작성한다.
- master key는 이 SQL, Supabase table, 문서, Git에 입력하지 않는다.
- Production rollback 목적으로 AI table을 즉시 DROP하지 않는다. 먼저 AI route를 비활성화하고 데이터 보존·폐기 결정을 별도로 내린다.
