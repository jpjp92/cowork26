# Supabase migration 007 실행 안내

대상 migration: `supabase/migrations/007_page_content_revision.sql`

이 migration은 페이지 title/content 자동 저장에 optimistic concurrency control을 추가한다. 두 창이 같은 revision을 편집하면 먼저 저장된 요청만 성공하고, 늦게 도착한 stale 요청은 API에서 `409 PAGE_REVISION_CONFLICT`로 거부된다.

## 현재 실행 여부

코드와 migration이 같은 Preview/Test 환경에 배포되기 전에는 Production에 적용하지 않는다. 새 API 코드는 `content_revision` column을 조회하므로 적용 순서는 **DB migration 먼저, 이어서 같은 코드 배포**다. migration 적용 후 구버전 main 앱은 계속 동작하지만 revision 조건을 사용하지 않으므로 전환 시간을 짧게 유지한다.

## 1. 실행 전 확인

```sql
SELECT to_regclass('public.pages') AS pages_table;

SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pages'
  AND column_name = 'content_revision';

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'pages'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'pages'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;
```

- `pages_table`은 `pages`여야 한다.
- `content_revision`이 없으면 정상적인 기존 상태다.
- 이미 존재한다면 `BIGINT NOT NULL DEFAULT 0`인지 확인하고 결과를 공유한다.
- migration은 기존 page title/content를 변경하지 않는다.

## 2. 적용

먼저 Preview/Test Supabase SQL Editor에서 아래 파일 전체를 `BEGIN;`부터 `COMMIT;`까지 한 번에 실행한다.

```text
supabase/migrations/007_page_content_revision.sql
```

오류가 발생하면 transaction이 rollback된다. column이나 policy를 임의 수정하지 말고 오류 전문을 공유한다.

## 3. 적용 후 SQL 검증

```sql
SELECT column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pages'
  AND column_name = 'content_revision';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.pages'::regclass
  AND conname = 'pages_content_revision_nonnegative';

SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'pages'
  AND trigger_name = 'pages_content_revision';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'pages'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'pages'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  AND privilege_type <> 'SELECT'
ORDER BY grantee, privilege_type;
```

기대 결과:

- `content_revision`: `int8`, `NO`, default `0`
- nonnegative CHECK constraint 존재
- UPDATE trigger 한 행
- `pages_member_select`는 유지
- `pages_editor_insert/update/delete` policy는 없음
- 브라우저 role에는 SELECT만 남고 INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grant 결과 0행

## 4. API와 UI 검증

1. 페이지 title을 바꾸면 저장되고 revision이 1 증가한다.
2. content를 바꾸면 저장되고 revision이 1 증가한다.
3. page 이동이나 순서 변경만 하면 revision은 증가하지 않는다.
4. 같은 페이지를 두 브라우저 창에서 연다.
5. 첫 번째 창에서 저장한 뒤 두 번째 창의 이전 revision 저장이 `409`로 거부되는지 확인한다.
6. 두 번째 창의 로컬 편집 내용이 사라지지 않고 `충돌` 상태와 오류 안내가 보이는지 확인한다.
7. 충돌 상태에서 strict flush가 실패해 후속 AI 호출을 진행할 수 없는지 향후 AI 통합 test에서 확인한다.

## 5. Production 적용

Preview/Test에서 위 검증을 통과한 뒤 Production에 migration을 적용하고 새 코드를 연속 배포한다. 구버전 deployment로 되돌리면 revision 조건 없는 저장이 다시 가능하므로 rollback 시 feature flag만이 아니라 deployment 호환성도 확인한다.

## 6. 실패 시

- 기존 `pages` row를 삭제하거나 revision을 임의로 증가시키지 않는다.
- direct browser mutation policy를 다시 만들지 않는다.
- 앱 저장 실패 시 server가 `SUPABASE_SERVICE_KEY`를 사용하는지 확인한다.
- 충돌 발생 시 로컬 내용을 자동 폐기하거나 최신 server 문서에 자동 덮어쓰지 않는다.
