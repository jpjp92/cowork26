# Supabase migration 006 실행 안내

대상 migration: `supabase/migrations/006_page_assets_baseline.sql`

이 migration은 history 문서에만 있던 `page_assets` table과 Storage bucket 계약을 정식 baseline으로 만든다. 기존 table이나 bucket이 있으면 삭제·재생성하지 않고 예상 schema와 설정이 같은지 검사한다. 차이가 있으면 migration을 중단하므로 결과를 임의 수정하지 말고 공유해야 한다.

## 현재 실행 여부

이 파일이 포함된 코드를 먼저 Preview/Test 환경에서 검증한 뒤 실행한다. 저장소에 SQL을 추가하는 것만으로 Supabase에 자동 적용되지 않는다.

## 1. 실행 전 backup과 환경 확인

1. 대상 Supabase project가 Preview/Test인지 Production인지 다시 확인한다.
2. Database backup 또는 point-in-time recovery 상태를 확인한다.
3. `001`~`005` migration이 적용됐는지 확인한다.
4. 아래 read-only query 결과를 저장한다.

### Table과 컬럼

```sql
SELECT to_regclass('public.page_assets') AS page_assets_table;

SELECT
  column_name,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'page_assets'
ORDER BY ordinal_position;

SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.page_assets'::regclass
ORDER BY conname;
```

`page_assets_table`이 `null`이면 뒤의 constraint query는 relation 오류가 날 수 있으므로 table/column 결과까지만 확인하고 migration을 실행한다.

### 기존 데이터 무결성

`page_assets`가 이미 있을 때만 실행한다.

```sql
SELECT asset.id, asset.workspace_id, asset.page_id, page.workspace_id AS page_workspace_id
FROM public.page_assets AS asset
LEFT JOIN public.pages AS page ON page.id = asset.page_id
WHERE page.id IS NULL OR page.workspace_id <> asset.workspace_id;

SELECT id, mime_type, size_bytes, width, height
FROM public.page_assets
WHERE mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
   OR size_bytes <= 0
   OR (width IS NOT NULL AND width <= 0)
   OR (height IS NOT NULL AND height <= 0);

SELECT storage_path, COUNT(*)
FROM public.page_assets
GROUP BY storage_path
HAVING COUNT(*) > 1;
```

세 query 모두 0행이어야 한다. 행이 나오면 migration이 의도적으로 실패한다.

### RLS, grant와 policy

```sql
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.page_assets'::regclass;

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'page_assets'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'page_assets'
ORDER BY grantee, privilege_type;
```

### Storage bucket

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'page_assets';

SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (
    policyname ILIKE '%page_assets%'
    OR COALESCE(qual, '') ILIKE '%page_assets%'
    OR COALESCE(with_check, '') ILIKE '%page_assets%'
  )
ORDER BY policyname;
```

기대 bucket 계약:

- `public = true`
- `file_size_limit = 20971520` (20 MiB)
- MIME allowlist: PNG, JPEG, WebP, GIF 네 종류만 포함

기존 bucket 설정이 다르면 migration은 자동 변경하지 않고 중단한다.

## 2. Preview/Test 적용

Supabase SQL Editor에서 다음 파일 전체를 한 번 실행한다.

```text
supabase/migrations/006_page_assets_baseline.sql
```

다음 오류가 나오면 중단하고 오류 전문과 실행 전 query 결과를 공유한다.

- `page_assets column drift`
- `page_assets primary key drift`
- `page_assets storage_path unique constraint drift`
- `page_assets foreign key drift`
- `page_assets default value drift`
- `page_assets check constraint drift`
- `Existing page_assets contain ...`
- `page_assets bucket drift`

일부 column, constraint 또는 bucket 설정을 임의로 바꿔서 재실행하지 않는다.

## 3. 적용 후 SQL 검증

```sql
SELECT
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_class AS c
WHERE c.oid = 'public.page_assets'::regclass;

SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'page_assets'
  AND trigger_name = 'page_assets_scope_integrity'
ORDER BY event_manipulation;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'page_assets'
ORDER BY indexname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'page_assets'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'page_assets';

SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'page_assets';

SELECT policyname, permissive, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname = 'page_assets_block_direct_access';
```

기대 결과:

- RLS와 FORCE RLS가 모두 `true`
- trigger 결과가 `INSERT`, `UPDATE` 두 행
- 네 개의 보조 index와 PK/unique index 존재
- `PUBLIC`, `anon`, `authenticated` table grant 결과 0행
- `page_assets` table policy 결과 0행
- bucket 설정이 20 MiB, 네 MIME allowlist, public
- `page_assets_block_direct_access`가 `RESTRICTIVE`, `ALL`, `anon/authenticated` 대상으로 존재

## 4. 앱 검증

Preview/Test 앱에서 owner/editor 계정으로 다음을 확인한다.

1. PNG/JPEG/WebP/GIF 이미지 업로드가 성공한다.
2. 20MB 초과 파일과 허용하지 않은 MIME이 거부된다.
3. 같은 workspace의 다른 page로 이미지 복사가 성공한다.
4. viewer의 업로드가 거부된다.
5. 다른 workspace의 page ID를 조합한 완료 요청이 거부된다.
6. 브라우저 publishable key로 `page_assets` 직접 조회·추가·수정·삭제가 거부된다.
7. 기존 문서의 public image URL이 계속 렌더링된다.

Signed Upload URL 업로드까지 실패하면 임의로 restrictive policy를 삭제하지 말고 요청 상태와 Storage 오류를 공유한다. 현재 Supabase Signed Upload URL은 별도 upload token을 사용하는 흐름을 전제로 하며, Preview에서 이를 반드시 확인한 뒤 Production에 적용한다.

## 5. Production 적용

Preview/Test의 SQL 및 앱 검증 결과를 보관한 후에만 같은 파일 전체를 Production SQL Editor에서 실행한다. 성공 후 3절의 검증 query를 다시 실행한다.

적용 완료 사실과 검증 결과를 공유하기 전까지 다음 migration `007_page_content_revision.sql`은 Production에 적용하지 않는다.

## 6. 실패 시 처리

- migration은 기존 table, row, bucket을 삭제하지 않는다.
- 실패 시 자동 rollback 여부와 생성된 객체를 SQL Editor 결과에서 확인한다.
- 수동 `DROP TABLE`, bucket 삭제, constraint 삭제는 하지 않는다.
- 기존 schema drift는 별도 보정 migration으로 해결한다.
- public bucket 자체가 현재의 명시된 호환 계약이다. private 전환은 signed read URL과 문서 content migration을 포함한 별도 작업으로 진행한다.
