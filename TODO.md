# TODO

## Undo / Version History

- `pages.content`는 최신 문서 상태를 유지하고, 저장 이력은 별도 테이블에 insert하는 구조로 분리한다.
- 신규 테이블 후보: `page_versions` 또는 `page_snapshots`.
- 저장 시점마다 다음 정보를 기록한다.
  - `page_id`
  - `workspace_id`
  - `revision`
  - `title`
  - `content`
  - `created_by`
  - `created_at`
- `PATCH /api/pages`에서 content 저장 전후로 version insert를 수행한다.
- 자동 저장이 1.5초마다 발생하므로 모든 저장을 버전으로 남길지, 일정 간격/의미 있는 변경만 남길지 결정한다.
- 오래된 클라이언트가 최신 내용을 덮어쓰지 않도록 `updated_at` 또는 별도 `revision` 기반 충돌 감지를 추가한다.
- 복구 UI를 설계한다.
  - 페이지별 버전 목록 조회
  - 특정 버전 미리보기
  - 특정 버전으로 복원
- 버전 보관 정책을 정한다.
  - 최근 N개만 유지
  - 최근 N일만 유지
  - 중요 버전 pin 지원 여부

## Persistence Risks

- 현재 본문 저장은 Tiptap 문서 JSON 전체 덮어쓰기 방식이다.
- 실시간 협업이 연결되기 전까지는 여러 사용자가 같은 페이지를 동시에 편집하면 마지막 저장이 이전 저장을 덮을 수 있다.
- 수동 새로고침 전 미저장 디바운스 내용은 먼저 flush하도록 처리되어 있지만, 동시 편집 충돌은 별도 해결이 필요하다.

