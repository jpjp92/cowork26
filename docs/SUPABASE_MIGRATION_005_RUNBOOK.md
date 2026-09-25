# Supabase migration 005 실행 안내

대상 migration: `supabase/migrations/005_pages_tree_integrity.sql`

이 migration은 page의 부모가 같은 workspace에 속하도록 강제하고 자기참조·조상 순환을 차단한다. API 검증만으로는 Supabase 직접 호출이나 service-role 작업을 막을 수 없으므로 DB trigger도 적용해야 한다.

## 적용

Supabase SQL Editor에서 migration 파일 전체를 실행한다. 기존 데이터에 cross-workspace parent 또는 cycle이 있으면 첫 검증 단계에서 오류를 내고 trigger를 만들지 않는다. 이 경우 데이터를 자동 수정하지 말고 오류를 공유한 뒤 대상 row를 먼저 조사한다.

## 적용 후 확인

```sql
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'pages'
  AND trigger_name = 'pages_tree_integrity'
ORDER BY event_manipulation;
```

`INSERT`, `UPDATE` 두 행이 조회되어야 한다.

앱에서는 다음을 확인한다.

1. 루트 page와 하위 page 생성이 정상 동작한다.
2. 같은 workspace 안에서 page 이동이 정상 동작한다.
3. 자기 자신이나 자신의 자손 안으로 이동하려는 요청은 HTTP 400으로 거부된다.
4. 다른 workspace의 page ID를 `parentId`로 보내면 HTTP 400으로 거부된다.
