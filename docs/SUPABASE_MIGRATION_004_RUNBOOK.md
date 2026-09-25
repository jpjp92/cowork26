# Supabase migration 004 실행 안내

대상 migration: `supabase/migrations/004_workspace_members_hardening.sql`

이 migration은 로그인 사용자가 Supabase 브라우저 클라이언트를 통해 임의 workspace의 `workspace_members` row를 직접 만들고 `owner` 권한을 얻을 수 있는 경로를 제거한다. 저장소에 migration 파일을 추가하는 것만으로는 운영 DB에 반영되지 않는다.

## 실행 전 확인

Production과 Preview/Development Supabase 프로젝트 각각에서 SQL Editor를 열고 아래 조회를 실행한다. 결과를 보관한 뒤 migration을 적용한다.

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'workspace_members'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'workspace_members'
ORDER BY grantee, privilege_type;

SELECT workspace_id, user_id, role
FROM workspace_members
WHERE role NOT IN ('owner', 'editor', 'viewer');

SELECT workspace_id
FROM workspace_members
GROUP BY workspace_id
HAVING COUNT(*) FILTER (WHERE role = 'owner') = 0;
```

세 번째와 네 번째 query가 행을 반환하면 migration 전에 데이터를 조사한다. 자동으로 role이나 owner를 보정하지 않는다.

## 적용

SQL Editor에서 `004_workspace_members_hardening.sql` 전체를 실행하거나, 프로젝트의 표준 Supabase migration workflow로 적용한다. 실행하는 계정은 policy와 grant 변경 권한이 있어야 한다.

## 적용 후 검증

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'workspace_members'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'workspace_members'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;
```

- `workspace_members_owner_insert` policy가 없어야 한다.
- `PUBLIC`, `anon`, `authenticated`에 INSERT/UPDATE/DELETE grant가 없어야 한다.
- `workspace_members_select` policy는 남아 읽기 권한을 RLS로 계속 제어해야 한다.

그 다음 실제 앱에서 다음을 확인한다.

1. 로그인 사용자가 workspace를 새로 만든다.
2. owner가 editor와 viewer를 초대한다.
3. 세 역할이 각각 허용된 workspace/page 기능을 사용할 수 있다.
4. 브라우저의 publishable key와 일반 사용자 access token으로 타 workspace에 member INSERT를 시도하면 거부된다.

실패 시 migration을 되돌리는 대신, Supabase SQL 오류와 실행 전 grant/policy 결과를 보관한 뒤 server API의 service-role grant를 먼저 확인한다. 임의의 self-insert RLS policy를 다시 만들면 안 된다.
