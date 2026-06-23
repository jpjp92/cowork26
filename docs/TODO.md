# TODO

## Undo / Version History

- `pages.content`는 최신 문서 상태를 유지하고, 저장 이력은 별도 테이블에 insert하는 구조로 분리한다.
- `pages`에 `revision INT NOT NULL DEFAULT 0` 컬럼을 추가한다.
  - content 저장 성공 시 revision을 1 증가시킨다.
  - title-only 저장도 revision에 포함할지 결정한다.
  - 클라이언트 `PageRecord`에 `revision`을 포함한다.
- 신규 테이블 후보는 `page_versions`로 정한다.
- `page_versions` 저장 후보 필드:
  - `page_id`
  - `workspace_id`
  - `revision`
  - `title`
  - `content`
  - `created_by`
  - `created_at`
- 추가 후보 필드:
  - `change_type` (`content`, `title`, `restore`)
  - `content_hash`
  - `pinned`
- `PATCH /api/pages` 요청에 `baseRevision`을 포함한다.
  - 서버의 현재 revision과 `baseRevision`이 다르면 `409 Conflict`를 반환한다.
  - 409 응답에는 최소한 최신 `id`, `revision`, `updated_at`, `title`을 포함한다.
  - 필요 시 최신 `content`도 포함할지 결정한다.
- `PATCH /api/pages`에서 content 저장 성공 시 `page_versions` insert를 수행한다.
  - version insert와 pages update는 가능하면 RPC/transaction으로 묶는다.
  - transaction을 바로 도입하지 않으면 실패 시 재시도/복구 전략을 별도 기록한다.
- 자동 저장이 1.5초마다 발생하므로 version 저장 정책을 정한다.
  - 모든 autosave를 버전으로 남기면 이력이 너무 빨리 증가한다.
  - 1차 정책 후보: 페이지별 최소 30초 간격 또는 content hash 변화가 있을 때만 저장.
  - 수동 복원(`restore`)은 항상 version으로 남긴다.
- 복구 UI를 설계한다.
  - 페이지별 버전 목록 조회
  - 특정 버전 미리보기
  - 특정 버전으로 복원
- 복구 API 후보:
  - `GET /api/pages/:id/versions`
  - `GET /api/pages/:id/versions/:revision`
  - `POST /api/pages/:id/restore`
- 복원 동작은 과거 version을 그대로 `pages.content`에 덮어쓰되 새 revision을 발급한다.
- 버전 보관 정책을 정한다.
  - 최근 N개만 유지
  - 최근 N일만 유지
  - 중요 버전 pin 지원 여부

## Persistence Risks

- 현재 본문 저장은 Tiptap 문서 JSON 전체 덮어쓰기 방식이다.
- 실시간 협업이 연결되기 전까지는 여러 사용자가 같은 페이지를 동시에 편집하면 마지막 저장이 이전 저장을 덮을 수 있다.
- 수동 새로고침 전 미저장 디바운스 내용은 먼저 flush하도록 처리되어 있지만, 동시 편집 충돌은 별도 해결이 필요하다.
- 현재 `loadPages()`의 background reconcile은 `pendingContent`/저장 중 content를 보호하지만, 서버 저장 단계의 stale write는 막지 못한다.
- 단일 페이지 fresh fetch도 로컬 미저장 상태와 서버 최신본 사이 race를 계속 주의해야 한다.

## Implementation Order

1. `pages.revision` 마이그레이션 추가.
2. `PageRecord`/API select 응답에 `revision` 포함.
3. `PATCH /api/pages`에 `baseRevision` 검증과 `409 Conflict` 응답 추가.
4. 클라이언트 저장 요청에서 현재 page revision을 `baseRevision`으로 전송.
5. 409 발생 시 저장 중단 + 사용자에게 충돌 안내.
6. `page_versions` 마이그레이션 추가.
7. content 저장 성공 시 version insert 추가.
8. version 목록/미리보기/복원 API 추가.
9. 복구 UI 추가.
