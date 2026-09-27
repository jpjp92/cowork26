# AI 문서 편집 기반·DB·보안 계획

> 상위 계획: [AI 문서 편집 Master Roadmap](./PLAN_20260830_AI_DOCUMENT_EDITING.md)
> 상태: 구현 전 필수 선행 작업
> 범위: 저장 충돌, migration, AI 데이터 모델, credential crypto, Vercel 배포 보안

## 1. 목적

AI 기능을 추가하기 전에 기존 저장 방식과 배포 보안 경계를 정비한다. 이 문서가 완료되지 않으면 provider API와 사용자 credential을 production에서 활성화하지 않는다.

## 2. 확인된 기반 문제

| 영역 | 현재 상태 | 필요한 변경 |
|---|---|---|
| 페이지 저장 | ID만 조건으로 title/content 전체 갱신 | `content_revision` 조건부 저장 |
| 브라우저 저장 | content debounce, title blur, 오류 일부 내부 처리 | page별 직렬 save coordinator와 strict flush |
| DB migration | `page_assets`가 history SQL에만 존재 | 정식 idempotent migration |
| workspace 생성 | workspace/member/welcome page가 별도 query | disabled AI policy까지 원자적 생성 또는 보상 삭제 |
| admin client | `SUPABASE_KEY` fallback 허용 | `server-only`, service key 명시 |
| auth cache | raw bearer token을 Map key로 사용 | SHA-256 digest key, fresh-auth option |
| API 오류 | 일부 DB 원문 반환 | safe error envelope와 redaction |
| 테스트 | 통합 test script 없음, 일부 tests ignore/untracked | Vitest와 DB/API 보안 tests |
| legacy AGI | 별도 iframe/실행 파일 보안 모델 | 신규 기능과 분리, production disabled gate |

## 3. 불변 보안 조건

1. service-role 및 crypto 모듈은 client bundle에서 import하지 않는다.
2. request body, Authorization header, API key, provider raw response를 로깅하지 않는다.
3. provider endpoint는 server adapter 상수이며 사용자 URL을 fetch하지 않는다.
4. 서버가 page → workspace를 조회하고 membership/role/policy를 다시 계산한다.
5. client가 보낸 role, source content, usage, workspace ID 관계를 신뢰하지 않는다.
6. output의 raw HTML, unsafe URL, 임의 image URL을 거부한다.
7. credential과 private draft는 cross-user 접근이 불가능해야 한다.
8. 원본 revision 비교와 apply UPDATE는 하나의 DB transaction에서 수행한다.
9. 민감 RPC는 `PUBLIC`, `anon`, `authenticated` execute 권한을 revoke한다.
10. 민감 API는 `Cache-Control: no-store`를 사용한다.

## 4. Migration 계획

### `006_page_assets_baseline.sql`

- `docs/history/DEV_260615.md`의 `page_assets` table, constraints, indexes, RLS를 정식 migration으로 승격한다.
- 기존 운영 DB에 이미 존재할 수 있으므로 schema drift를 먼저 확인하고 idempotent하게 작성한다.
- fresh DB와 기존 DB 양쪽에서 forward migration을 검증한다.
- Storage bucket 생성, MIME allowlist, size limit은 운영 체크리스트에 별도로 기록한다.

### `007_page_content_revision.sql`

- `pages.content_revision BIGINT NOT NULL DEFAULT 1` 추가
- title/content가 실제로 바뀔 때만 revision 증가
- parent/order metadata 변경은 content revision을 증가시키지 않음
- 기존 `updated_at` trigger와 실행 순서 검증
- 일반 page conditional update와 AI apply RPC 기반 제공

### `008_ai_document_editing.sql`

- `user_ai_credentials`
- `workspace_ai_policies`
- `ai_generation_requests`
- `ai_page_drafts`
- indexes, checks, timestamps, RLS, grants
- 기존 workspace에 `enabled=false` policy backfill
- atomic replace-original RPC

Migration 원칙:

- Dashboard에서만 실행한 SQL을 남기지 않는다.
- destructive drop/rewrite 대신 forward-fix한다.
- 적용 전 remote schema dump와 예상 schema를 비교한다.
- migration별 검증 SQL과 운영 rollback 절차를 남긴다.

## 5. AI 테이블 계약

### `user_ai_credentials`

- PK: `(user_id, provider)`
- provider: `openai|gemini|anthropic`
- `ciphertext`, `nonce`, `auth_tag`, `key_version`
- `key_hint`, `default_model`, `verified_at`, timestamps
- RLS enabled, browser direct CRUD policy/grant 없음
- server route도 반드시 authenticated `user.id` 조건으로 접근

### `workspace_ai_policies`

- `workspace_id` PK
- `enabled=false`
- `allowed_providers`, `allowed_roles`
- `notice_version`, `updated_by`, `updated_at`
- member는 공개 상태만 조회, owner만 변경

### `ai_generation_requests`

- user/workspace/page 관계
- `(user_id, idempotency_key)` unique
- provider/model/instruction/requested intent
- source revision/hash
- status: `pending|running|succeeded|failed|cancel_requested|stale`
- normalized error code, draft ID, char/token counts, timings
- provider raw response/error 저장 금지

### `ai_page_drafts`

- page/workspace/user와 generation request FK
- provider/model/intent, source revision/hash
- `draft_title`, canonical Tiptap `content`
- optional generated body Markdown, bounded summaries/warnings
- status: `draft|applied|discarded`
- 생성자 본인 + current workspace membership 필요
- PATCH는 사용자 편집용 title/content만 허용

### 보관

- active draft: 사용자 삭제 전 유지
- applied/discarded draft와 success request: 30일 정리 대상
- failed/stale request: 7일 정리 대상
- 자동 cleanup이 MVP에서 빠지면 수동 runbook을 먼저 제공한다.

## 6. PageSaveCoordinator

기존 `use-page-persistence.ts`를 다음 계약으로 리팩터링한다.

- page별 dirty title/content와 마지막 server revision 관리
- page당 mutation 하나만 in-flight
- 저장 중 생긴 변경은 다음 mutation으로 병합
- title/content 동시 dirty면 한 PATCH로 저장
- content/title PATCH에 `baseRevision` 필수
- 저장 오류를 삼키지 않고 `flushPage(pageId)`에 reject
- HTTP 409 시 local dirty buffer 보존, 자동 overwrite 금지
- AI generation은 active page strict flush 성공 후 반환 revision 사용

### Atomic apply RPC

한 transaction에서 다음을 수행한다.

1. draft/page row lock
2. draft owner, membership, role, workspace policy, draft status 확인
3. `pages.content_revision = draft.source_revision` 확인
4. title/content update와 revision 증가
5. draft applied 상태와 applied page 기록
6. 갱신 page 반환

불일치하면 어떤 UPDATE도 하지 않고 `AI_DRAFT_CONFLICT`를 반환한다.

## 7. Credential 암호화

- AES-256-GCM
- record마다 12-byte random nonce
- AAD: `cowork26:user-ai-credential:v1:{userId}:{provider}:{keyVersion}`
- `AI_CREDENTIALS_ACTIVE_KEY_VERSION`
- `AI_CREDENTIALS_ENCRYPTION_KEYS`: version → Base64 32-byte key map
- startup/lazy init에서 JSON, Base64, version, byte length 검증
- last 4자리만 hint로 저장; 짧은 key에는 hint 없음
- nested Error/object redactor를 공용화
- provider raw body와 request headers 저장·반환 금지

### 회전

1. 새 key version을 map에 추가한다.
2. active version으로 재배포한다.
3. lazy re-encryption 또는 maintenance script로 row를 전환한다.
4. backup과 row version 확인 후 이전 key를 제거한다.
5. master key 유출 시 사용자 provider key도 폐기·교체하도록 안내한다.

## 8. Vercel 보안 설정

### 환경 분리

| 자원 | Production | Preview | Development |
|---|---|---|---|
| Supabase | 운영 전용 project | 별도 preview/staging project | local/개발 project |
| service key | 운영 key, Sensitive | preview key, Sensitive | `.env.local` |
| encryption keys | 운영 map, Sensitive | 운영과 다른 map, Sensitive | local key |
| user provider keys | Vercel env 저장 금지 | 저장 금지 | 저장 금지 |
| `NEXT_PUBLIC_*` | 공개 가능한 값만 | preview 공개 값 | 개발 공개 값 |

필수 server configuration:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY                         # Sensitive
AI_CREDENTIALS_ACTIVE_KEY_VERSION
AI_CREDENTIALS_ENCRYPTION_KEYS               # Sensitive
AI_PROVIDER_REQUEST_TIMEOUT_MS=45000
AI_MAX_INPUT_CHARS=...
AI_MAX_OUTPUT_CHARS=...
AI_MAX_CONCURRENT_REQUESTS_PER_USER=...
AI_FEATURE_ENABLED=false
NEXT_PUBLIC_ENABLE_AGI=false
```

- Preview가 운영 Supabase/service/encryption key를 쓰면 배포를 중단한다.
- secret에는 `NEXT_PUBLIC_` 접두어를 사용하지 않는다.
- Production/Preview secret은 Sensitive Environment Variable로 만든다.
- env 수정 후 기존 deployment가 아닌 새 deployment를 생성한다.
- legacy AGI 미사용 환경에서는 JJAPVIS 관련 env를 제거한다.

### Deployment Protection과 권한

- Preview/generated deployment URL에 Vercel Authentication Standard Protection 적용
- production domain에는 Supabase application auth 계속 적용
- Shareable Link와 automation bypass는 최소 발급·회전
- team/project 역할을 최소화하고 secret/firewall/domain/deploy 변경 권한 제한
- 지원 plan에서는 Enforce Sensitive Environment Variables 활성화
- Activity/Audit Log로 보안 설정 변경 확인

### Firewall

관찰 후 rate limit/enforce할 경로:

```text
/api/ai/settings/test
/api/ai/generations
/api/ai/drafts/*/apply
```

- credential test에 짧은 burst limit
- generation/apply의 비정상 burst 제한
- legacy AGI 미사용 시 `/api/agi` deny
- WAF IP limit과 application `user_id` rate/concurrency/idempotency를 병행

### Function

```ts
export const runtime = 'nodejs'
export const maxDuration = 60
```

- provider timeout은 기본 45초로 두어 hard termination 전에 DB 상태 기록
- plan별 max duration 확인
- 현재 빈 `vercel.json`은 global 설정이 필요할 때만 명시적으로 사용
- region과 Supabase latency/data residency 확인

### Logs

- Runtime Logs에 key, instruction, 문서, request body/header, raw response 출력 금지
- smoke test 후 test key와 문서 marker 검색 결과 0건 확인
- Log Drain destination 접근/보관/sampling 제한과 signature 검증
- alert는 normalized code, 429/5xx, duration, stale request, firewall action만 사용

### Vercel release checklist

- [ ] Production/Preview Supabase와 encryption key 분리
- [ ] secrets가 Sensitive이며 `NEXT_PUBLIC_`에 없음
- [ ] env 변경 후 새 deployment 완료
- [ ] Preview/generated URL Deployment Protection 적용
- [ ] AI endpoint WAF rules 확인
- [ ] Node runtime, provider timeout, max duration 확인
- [ ] Runtime/Drain secret scan 0건
- [ ] team/project/CI access 최소화
- [ ] legacy AGI disabled/denied
- [ ] migration과 검증 완료 전 AI feature flag false

Official references:

- [Sensitive Environment Variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Environment management](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Vercel Firewall](https://vercel.com/docs/vercel-firewall)
- [Function duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Runtime Logs](https://vercel.com/docs/logs/runtime)

## 9. Ordered Tasks

### F0 — source-of-truth와 security gate

**Modify:** `.gitignore`, `package.json`, `.env.example`, `lib/supabase-admin.ts`, `app/api/_utils/auth.ts`
**Create:** `app/api/_utils/api-error.ts`, `tests/security/`

- [ ] tests ignore 정리, Vitest와 통합 scripts
- [ ] admin `server-only`, service key fallback 제거
- [ ] auth cache digest와 fresh-auth option
- [ ] safe error envelope/request ID
- [ ] legacy AGI production disabled gate

### F1 — migration baseline과 page revision

**Create:** `supabase/migrations/006_page_assets_baseline.sql`, `supabase/migrations/007_page_content_revision.sql`, `hooks/use-page-save-coordinator.ts`
**Modify:** pages API, notion-lite types/API, page persistence

- [ ] page_assets baseline
- [ ] revision/trigger/conditional PATCH
- [ ] save serialization/strict flush
- [ ] 409 local data preservation tests

### F2 — AI schema와 crypto

**Create:** `supabase/migrations/008_ai_document_editing.sql`, credential crypto/redaction primitives, DB/security tests

- [ ] four AI tables와 policies/grants
- [ ] atomic apply RPC
- [ ] versioned AES-GCM primitive와 rotation path
- [ ] cross-user, viewer, membership removal, RPC ACL tests

### F3 — Vercel release configuration

**Modify:** `.env.example`, `README.md`, AI route segment config 또는 `vercel.json`
**Create:** key rotation/retention/provider incident/Vercel release runbooks

- [ ] environment isolation과 Sensitive secrets
- [ ] Deployment Protection, WAF, team access
- [ ] Function timeout과 logs secret scan
- [ ] old deployment protection과 rotation procedure

## 10. Exit Criteria

- fresh DB와 기존 DB 모두 migration 성공
- stale 일반 PATCH와 stale AI apply가 원본을 덮어쓰지 않음
- strict flush 실패 시 provider 미호출
- browser direct credential CRUD 실패
- cross-user/workspace/viewer/policy 우회 실패
- key/tamper/AAD/version/redaction tests 통과
- Production/Preview resource 분리와 Vercel release checklist 승인
- Runtime/Drain logs secret scan 0건
- production legacy AGI disabled
