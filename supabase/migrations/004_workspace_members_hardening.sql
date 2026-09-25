-- workspace_members는 server API(service_role)만 변경한다.
-- 기존 정책은 authenticated 사용자가 자신의 user_id로 임의 workspace에
-- owner를 포함한 membership을 INSERT할 수 있어 권한 상승이 가능했다.

DROP POLICY IF EXISTS "workspace_members_owner_insert" ON workspace_members;

-- 브라우저 anon/authenticated role은 membership을 직접 변경하지 못한다.
-- 읽기는 기존 workspace_members_select RLS policy가 계속 제어한다.
REVOKE INSERT, UPDATE, DELETE ON TABLE workspace_members FROM PUBLIC, anon, authenticated;
