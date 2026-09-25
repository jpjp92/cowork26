# Main 브랜치 보안 개선 우선순위 계획

**작성일:** 2026-09-25  
**상태:** 분석 완료 · 구현 전  
**대상:** Supabase RLS/DB migration, Next.js 의존성, legacy AGI, 페이지·이미지 API

## 목표

`main`의 공개 공격 경로와 workspace 간 데이터 격리를 먼저 복구한다. 이후 업로드·문서 저장의 남용 및 무결성 위험을 줄이고, 재현 가능한 migration·테스트·운영 기준을 만든다.

## 제외 범위

- AI 문서 편집 기능 자체의 구현 (관련 기반 계획은 `PLAN_20260831_AI_DOCUMENT_EDITING_FOUNDATION_SECURITY.md` 참조)
- UI 전면 개편
- Supabase 또는 에디터 프레임워크 교체
- 검증 없이 운영 데이터·bucket 정책을 변경하는 작업

## 우선순위 요약

| 우선순위 | 영역 | 발견 내용 | 배포 기준 |
|---|---|---|---|
| P0 | 권한 격리 | 브라우저 사용자가 임의 workspace에 자신을 owner로 추가할 수 있는 RLS 정책 | 수정 migration 및 실제 운영 DB 검증 전에는 배포 금지 |
| P0 | 프레임워크 | `next@16.2.6`이 공개 RCE를 포함한 취약 범위 | 보안 패치 버전 업그레이드와 audit 통과 |
| P0 | AGI | 활성화 시 인증 없는 EXE 다운로드·실행·종료, HTTP 전송 | production route 제거 또는 재설계 완료 |
| P1 | 페이지 트리 | cross-workspace parent, self/cycle, cascade 삭제 가능성 | API와 DB에서 불변조건 강제 |
| P1 | 의존성 | Tiptap/Mermaid 등 편집기 의존성 공개 취약점 | lockfile 업데이트와 회귀 검증 |
| P1 | 이미지·API 남용 | public asset, upload 크기/횟수 제어 및 API rate limit 부재 | bucket 정책 및 abuse control 검증 |
| P2 | 저장·운영성 | 동시 저장 overwrite, schema drift, 전체 사용자 목록 순회 | revision·migration·관측성 기준 도입 |

## 기준선

- `npm run typecheck`, `npm run test:image-assets`, `npm run test:editor-paste-priority`, `npm run build`는 분석 시점에 통과했다.
- `npm audit --omit=dev`는 critical 1, high 5, moderate 37을 보고했다.
- 현재 `tests/` 및 AI 관련 계획 문서는 untracked 상태일 수 있다. 이 계획을 구현할 때 사용자 작업물을 수정·삭제하지 않는다.
- 소스 migration은 운영 Supabase에 실제 적용됐는지 보장하지 않는다. P0 변경 전 remote schema 및 Storage bucket 정책을 읽기 전용으로 확인한다.

---

## Phase 0 — 즉시 노출 차단

### 0.1 Workspace member RLS 권한 상승 제거

**문제:** `workspace_members` INSERT policy가 `user_id = auth.uid()`를 허용하고 role을 제한하지 않는다. 로그인 사용자가 workspace ID만 알면 자신을 `owner`로 삽입할 수 있고, 이후 pages/workspace RLS를 통과한다.

**대상 파일**

- Create: `supabase/migrations/004_workspace_members_hardening.sql`
- Modify: `app/api/workspaces/route.ts` (workspace 생성 흐름의 원자성 검토)
- Modify: `app/api/workspaces/[id]/members/route.ts` (초대 경로의 서버 전용 계약 명시)
- Create: `tests/security/workspace-members.rls.sql` 또는 Supabase integration test

**작업**

- [ ] 운영 DB의 `workspace_members` 정책, grants, service-role/anon/authenticated 역할을 조회해 소스와 drift 여부를 기록한다.
- [ ] `authenticated`/`anon`의 직접 INSERT를 거부한다. 클라이언트가 직접 member row를 만들 필요가 없다면 RLS INSERT policy를 제거하고 table grant도 revoke한다.
- [ ] workspace 생성과 owner membership 생성은 service-role 전용 API 또는 좁게 권한을 준 `SECURITY DEFINER` RPC 한 transaction으로 처리한다.
- [ ] 초대 API는 owner를 재확인하고, 허용 role을 `editor|viewer`로 고정한다.
- [ ] 기존 member row에서 role이 허용 목록인지, workspace마다 owner가 존재하는지 점검하는 사전/사후 SQL을 작성한다.

**보안 테스트**

- [ ] 일반 authenticated JWT로 타 workspace에 자기 자신을 `viewer`, `editor`, `owner`로 INSERT하는 세 경우가 모두 거부된다.
- [ ] owner의 서버 API 초대는 `editor`/`viewer`만 성공한다.
- [ ] owner가 아닌 사용자의 초대 및 role 변경은 거부된다.
- [ ] 기존 member가 pages/workspaces를 정상 조회하는 회귀 테스트를 통과한다.

**완료 조건:** 임의 member 삽입과 owner 상승을 DB 차원에서 막으며, API 우회 요청으로도 재현되지 않는다.

### 0.2 Next.js 및 직접 의존성 보안 업데이트

**대상 파일**

- Modify: `package.json`
- Modify: `package-lock.json`

**작업**

- [ ] Next.js를 최소 보안 수정 버전(`>=16.3.3`) 이상으로 올린다. 최신 안정 버전을 우선 검토한다.
- [ ] 모든 `@tiptap/*` 패키지는 동일한 보안 수정 버전으로 정렬한다.
- [ ] Mermaid를 `>=11.16.1`로, audit이 지시하는 전이 의존성을 함께 갱신한다.
- [ ] `npm audit --omit=dev`의 critical/high가 0인지 확인한다. 잔여 moderate는 실제 도달 경로와 업그레이드 계획을 기록한다.

**검증**

```sh
npm ci
npm audit --omit=dev
npm run typecheck
npm run test:image-assets
npm run test:editor-paste-priority
npm run build
```

**완료 조건:** critical/high audit 항목이 없고, 에디터·이미지 업로드·production build 회귀가 없다.

### 0.3 Legacy AGI route 격리

**문제:** 활성화 시 `/api/agi`가 인증 없이 프로세스를 실행/종료하고, HTTP upstream에서 받은 EXE를 검증 없이 실행한다. iframe에는 현재 문서 컨텍스트도 외부 origin으로 전달된다.

**우선 결정:** production에서는 legacy AGI를 비활성화하고 route/client UI를 배포하지 않는다. 로컬 개발 도구가 필요하다면 웹 앱과 별도 실행 프로그램으로 분리한다.

**대상 파일**

- Modify or Remove: `app/api/agi/route.ts`
- Modify or Remove: `components/floating-ai-button.tsx`
- Modify: `components/notion-lite-app.tsx`
- Modify: `.env.example`, deployment runbook

**작업**

- [ ] production/preview 환경에서 `NEXT_PUBLIC_ENABLE_AGI`와 JJAPVIS 관련 변수를 제거 또는 false로 고정한다.
- [ ] route를 제거할 수 없다면 최소한 server-only feature flag, 강한 관리자 인증, CSRF/origin 정책, request rate limit, audit log를 적용한다.
- [ ] HTTP fallback과 임의 URL을 제거하고, HTTPS allowlist·고정 SHA-256·서명 검증·다운로드 크기 제한을 모두 만족하기 전에는 실행하지 않는다.
- [ ] PID 파일은 사용자 요청 전역 공유 상태가 되지 않게 하며, 임의 요청으로 kill할 수 없게 한다.
- [ ] 문서 내용/선택 텍스트/이미지 URL의 외부 전송은 명시적 사용자 동의와 대상 origin allowlist 없이는 하지 않는다.

**완료 조건:** production 공격자가 HTTP 요청만으로 바이너리를 내려받거나 실행·종료할 수 없고, 문서 데이터가 자동으로 외부 서비스에 전달되지 않는다.

---

## Phase 1 — 데이터 경계와 abuse control

### 1.1 페이지 트리 불변조건

**대상 파일**

- Modify: `app/api/pages/route.ts`
- Create: `supabase/migrations/005_pages_tree_integrity.sql`
- Create: `tests/security/pages-tree.test.ts`

**불변조건**

1. `parent_id`는 null 또는 동일 workspace의 존재하는 page여야 한다.
2. page는 자기 자신 또는 자신의 자손을 parent로 둘 수 없다.
3. parent 변경과 삭제가 다른 workspace page를 변경·삭제할 수 없다.

**작업**

- [ ] POST/PATCH에서 parent를 조회하고 동일 workspace 여부를 확인한다.
- [ ] parent 변경 시 recursive query 또는 DB trigger로 cycle을 거부한다.
- [ ] DB trigger도 같은 workspace/cycle을 강제하여 service-role API 우회를 막는다.
- [ ] 기존 데이터의 cross-workspace link/cycle을 검사하고, 수정 전 보존·복구 절차를 작성한다.

**완료 조건:** API 및 직접 DB mutation 테스트에서 cross-workspace parent와 cycle이 모두 거부된다.

### 1.2 이미지 storage를 private 기본값으로 전환

**대상 파일**

- Modify: `app/api/assets/route.ts`
- Modify: `app/api/assets/clone/route.ts`
- Create: storage bucket policy migration/runbook
- Modify: image rendering 및 asset type/API 계약

**작업**

- [ ] `page_assets` bucket의 public 여부, allowed MIME types, file size limit, object RLS를 운영 환경에서 확인한다.
- [ ] private bucket + 읽기 권한 재검증 + 짧은 수명의 signed read URL로 전환한다.
- [ ] prepare 단계에 사용자/workspace별 rate limit 및 quota를 둔다.
- [ ] bucket 차원 MIME·최대 파일 크기를 설정한다. 완료 API의 메타데이터 검증은 방어 심층으로 유지한다.
- [ ] 완료되지 않은 객체의 TTL cleanup을 scheduled job 또는 lifecycle rule로 적용한다.

**완료 조건:** URL만 알고 있는 비멤버가 이미지에 접근할 수 없고, 대용량/반복 signed-upload 남용이 quota·rate limit·bucket 정책에서 차단된다.

### 1.3 민감 API 공통 방어

**대상 파일**

- Modify: `app/api/_utils/auth.ts`
- Create: request validation/rate-limit utility
- Modify: pages, workspaces, assets, members routes

**작업**

- [ ] JSON body의 Content-Type 및 최대 크기를 공통 처리한다.
- [ ] title/content/orderIds/email 등의 타입·길이·개수 제한을 schema validation으로 통일한다.
- [ ] mutation route에 user+IP 기준 rate limit을 적용한다.
- [ ] 응답에서 Supabase 원문 오류를 노출하지 않고 request ID가 있는 안전한 error envelope를 사용한다.
- [ ] 민감 응답에는 `Cache-Control: no-store`를 명시한다.
- [ ] raw bearer token을 캐시 키로 보관하지 말고 SHA-256 digest로 대체하며, 권한 박탈 직후 필요한 경로는 role cache를 우회한다.

**완료 조건:** oversized/malformed body, 반복 mutation, raw DB 오류 노출, 권한 변경 직후 stale role 사용을 자동 테스트로 재현·차단한다.

---

## Phase 2 — 무결성·운영 재현성

### 2.1 정식 migration baseline

- [ ] `page_assets` table/index/RLS를 history 문서가 아닌 idempotent migration으로 승격한다.
- [ ] fresh database와 기존 운영 database 양쪽에 forward migration을 적용해 검증한다.
- [ ] migration마다 schema 검증 SQL과 rollback/forward-fix runbook을 남긴다.
- [ ] Dashboard에서 수동 변경된 Storage/RLS 설정을 코드와 운영 체크리스트에 동기화한다.

### 2.2 조건부 저장과 충돌 처리

- [ ] `pages.content_revision`을 추가하고 title/content PATCH에 `baseRevision`을 요구한다.
- [ ] 저장을 page별 직렬화하며, `409 Conflict` 시 local dirty content를 보존한다.
- [ ] 동시 저장, 재시도, 다른 탭 편집, page 전환 중 저장의 회귀 테스트를 추가한다.

### 2.3 멤버 조회 확장성

- [ ] workspace member 응답에 필요한 사용자만 조회하도록 `auth.admin.listUsers()` 전체 순회를 제거한다.
- [ ] profile projection 또는 제한된 server RPC를 사용하고 pagination/caching 기준을 명시한다.
- [ ] 초대 대상 탐색은 전체 auth user 열거 대신 정확 조회 가능한 별도 흐름을 설계한다.

---

## 배포 게이트

P0 완료 전에는 production 배포를 승인하지 않는다.

- [ ] remote RLS/grant/bucket 정책이 migration 및 runbook과 일치한다.
- [ ] 일반 사용자 JWT로 owner escalation, cross-workspace page link, asset read를 시도하는 integration test가 실패한다.
- [ ] `npm audit --omit=dev`에서 critical/high가 0이다.
- [ ] AGI route가 production bundle/route manifest에서 제외되거나, 재설계된 접근 통제를 통과한다.
- [ ] `npm ci`, typecheck, security/integration tests, production build가 모두 통과한다.
- [ ] migration backup, 적용 순서, failure 시 forward-fix 절차가 승인됐다.

## 가장 위험한 적용 지점

workspace member RLS 변경은 현재 workspace 생성·초대 흐름을 동시에 막을 수 있다. 따라서 운영 정책을 먼저 백업·조회하고, 테스트 사용자로 다음 순서를 검증한다: workspace 생성 → owner membership 생성 → editor/viewer 초대 → page 읽기/쓰기 → 비권한 직접 insert 거부. 이 흐름이 확인되기 전에는 policy를 운영 환경에 적용하지 않는다.
