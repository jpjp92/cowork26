# 워크스페이스 AI 분석 구체 구현 계획

**작성일:** 2026-09-26
**상태:** 구현 진행 중 · Task 1~3 검증 완료
**작업 브랜치:** `feat/workspace-ai-analysis-byok`
**기능 범위:** OpenAI/Gemini 개인 BYOK와 서버 관리형 선택 문서 분석
**상위 설계:** `PLAN_20260926_WORKSPACE_AI_ANALYSIS_BYOK.md`

**Prompt/provider 설계:** `PLAN_20260927_AI_PROMPT_PROVIDER_ARCHITECTURE.md`

**운영자 수동 작업:** `../WORKSPACE_AI_MANUAL_SETUP_GUIDE.md`

## 1. 이번 구현 목표

이번 브랜치에서는 무제한 workspace RAG가 아니라 다음 MVP까지만 구현한다.

1. 보안 테스트 기반과 bounded JSON parser를 준비한다.
2. page asset baseline과 content revision 기반을 정식 migration으로 만든다.
3. 사용자별 OpenAI/Gemini API key를 AES-256-GCM으로 독립 저장·검증·교체·삭제한다.
4. owner가 workspace AI 사용을 명시적으로 켤 수 있게 한다.
5. owner/editor가 동일 workspace의 page를 최대 10개 선택해 요약·정리·분석·질문·액션 아이템을 실행한다.
6. 결과에 검증된 source page 링크를 표시하되 원본 page는 변경하지 않는다.
7. Preview 내부 검증 전까지 Production feature flag는 꺼둔다.

Keyword retrieval, embedding, 자유 system prompt와 AI 결과의 원본 적용은 이번 브랜치의 완료 조건이 아니다.

## 2. 현재 저장소 기준 진행 상태

- 현재 migration은 `001`~`007`까지 존재하며 `006`, `007`은 대상 Supabase에서 수동 검증을 마쳤다.
- 기존 AI 문서의 미래 migration `004`~`006` 번호 충돌은 다음 번호로 정리했다.
  - `006_page_assets_baseline.sql`
  - `007_page_content_revision.sql`
  - `008_ai_document_editing.sql`
- Vitest unit/security runner와 기존 Node 회귀 test를 통합했고 bounded body/error contract를 추가했다.
- `getUserFromRequest()`와 `requireWorkspaceRole()`에 민감 경로용 fresh 조회 옵션을 추가했다.
- `lib/supabase-admin.ts`는 `server-only`이며 fallback 없이 `SUPABASE_SERVICE_KEY`를 사용한다. 이 경계는 유지한다.
- `.env.example`에는 AI feature flag와 encryption key placeholder가 있으며 실제 secret은 아직 설정하지 않는다.
- 공통 bounded parser 기반은 준비됐지만 일반 입력 제한 전체 적용은 별도 계획 범위다.

## 3. 고정 기술 결정

- Runtime: Next.js Node runtime
- Provider 순서: fake provider → OpenAI → Gemini, provider별 독립 feature flag
- Provider 호출: server-side `fetch`; 초기 MVP는 SDK dependency를 추가하지 않는다.
- Crypto: Node `crypto`의 AES-256-GCM
- Credential ownership: `(user_id, provider)` 개인 단위
- Credential DB 접근: 브라우저 direct CRUD 전부 차단, service-role API만 사용
- Master key: Vercel Sensitive Environment Variable
- Source: 서버가 DB에서 최신 page를 재조회
- 분석 한도: 최대 10 pages, 정규화 본문 합계 256KiB
- 결과 적용: 없음
- 기록: request metadata와 source revision만 저장, source 원문 복제 금지
- Prompt: 서버 관리형 5개 mode + 최대 1,000자 추가 요청, versioned template
- Output: provider 공통 structured JSON + runtime schema/citation 검증
- Feature flags: `AI_FEATURE_ENABLED`, `AI_OPENAI_ENABLED`, `AI_GEMINI_ENABLED`, `AI_WORKSPACE_ANALYSIS_ENABLED`

## 4. 작업 순서와 체크포인트

각 Task는 앞 Task의 검증이 통과해야 시작한다. migration과 provider 연결을 한 커밋에 섞지 않는다.

### Task 0 — 계획과 브랜치 기준점

**Modify**

- `README.md`
- `docs/plans/PLAN_20260830_AI_DOCUMENT_EDITING.md`
- `docs/plans/PLAN_20260831_AI_DOCUMENT_EDITING_FOUNDATION_SECURITY.md`

**Create**

- `docs/plans/PLAN_20260926_WORKSPACE_AI_ANALYSIS_BYOK.md`
- `docs/plans/PLAN_20260926_WORKSPACE_AI_ANALYSIS_IMPLEMENTATION.md`

**작업**

- [x] 전용 브랜치 `feat/workspace-ai-analysis-byok` 생성
- [x] migration 번호 충돌을 `006`~`008`로 수정
- [ ] 기획 문서만 먼저 커밋해 구현 전 기준점 확보

**검증**

```sh
git diff --check
git status --short
```

---

### Task 1 — 테스트 러너와 안전한 API 공통 계약

**Modify**

- `package.json`
- `.gitignore`
- `.env.example`
- `app/api/_utils/auth.ts`

**Create**

- `app/api/_utils/api-error.ts`
- `app/api/_utils/request-body.ts`
- `lib/input-limits.ts`
- `tests/unit/`
- `tests/security/`

**작업**

- [x] Vitest 또는 동등한 TypeScript test runner를 개발 의존성으로 추가한다.
- [x] `npm test`, `test:unit`, `test:security` script를 고정한다.
- [x] raw stream을 설정 byte까지만 읽는 bounded JSON parser를 만든다.
- [x] invalid JSON `400`, unauthenticated `401`, forbidden `403`, too large `413`, validation `422` 오류 계약을 만든다.
- [x] 오류 응답에 request ID와 정규화 code만 포함하고 raw error를 제거한다.
- [x] `getUserFromRequest`와 workspace role 검사에 cache bypass/fresh 옵션을 추가한다.
- [x] AI feature flags와 `AI_CREDENTIAL_ENCRYPTION_KEY_V1` placeholder를 `.env.example`에 추가한다.

**테스트**

- Content-Length 없음·거짓 값·chunked body 상한
- auth cache bypass에서 실제 `getUser` 재검증
- error serializer가 key, Authorization, document marker를 제거

**Exit**

- 민감 route가 `request.json()`을 직접 사용하지 않을 기반이 준비된다.
- 테스트 실패 시 이후 migration/provider 작업을 시작하지 않는다.

---

### Task 2 — `006_page_assets_baseline.sql`

**Create**

- `supabase/migrations/006_page_assets_baseline.sql`
- `docs/SUPABASE_MIGRATION_006_RUNBOOK.md`
- `tests/security/page-assets-schema.test.ts`

**작업**

- [x] 기존 운영 `page_assets` schema와 history SQL을 비교할 read-only query를 runbook에 고정한다.
- [x] table, constraints, indexes, RLS, grants와 Storage bucket 계약을 idempotent migration으로 승격한다.
- [x] 기존 운영 객체가 있을 때 drop/recreate하지 않고 drift를 명시적으로 실패시킨다.
- [x] 새 프로젝트와 기존 프로젝트 적용 절차를 runbook에 분리한다.

**Exit**

- fresh DB와 기존 DB에서 데이터 손실 없이 동일 schema가 된다.
- 사용자가 Supabase에서 실행해야 하는 SQL과 실행 후 검증 query가 문서화된다.

---

### Task 3 — `007_page_content_revision.sql`과 저장 충돌 방지

**Modify**

- `app/api/pages/route.ts`
- `lib/notion-lite/types.ts`
- `lib/notion-lite/api.ts`
- `hooks/use-page-persistence.ts`
- `components/notion-lite/document-pane.tsx`

**Create**

- `supabase/migrations/007_page_content_revision.sql`
- `docs/SUPABASE_MIGRATION_007_RUNBOOK.md`
- `hooks/use-page-save-coordinator.ts`
- revision API와 동시 저장 tests

**작업**

- [x] `pages.content_revision`과 title/content 변경 trigger 또는 conditional update contract를 추가한다.
- [x] PATCH에 `baseRevision`을 요구하고 stale write는 `409`로 거부한다.
- [x] page별 save를 직렬화하고 AI 실행 전 strict flush API를 제공한다.
- [x] `409`에서 로컬 dirty content를 버리지 않고 충돌 상태를 표시한다.
- [x] title/content 외 변경은 content revision을 올리지 않는다.

**Exit**

- 두 클라이언트의 stale PATCH가 최신 문서를 조용히 덮지 못한다.
- strict flush 실패 시 AI provider가 호출되지 않는다.

---

### Task 4 — Credential crypto와 redaction 순수 모듈

**Create**

- `lib/ai/providers.ts`
- `lib/ai/credential-crypto.ts`
- `lib/ai/redact-sensitive.ts`
- `lib/ai/env.ts`
- `tests/security/credential-crypto.test.ts`
- `tests/security/redaction.test.ts`

**작업**

- [x] 32-byte master key 형식과 version lookup을 시작 시 검증한다.
- [x] random 12-byte nonce와 AES-256-GCM encrypt/decrypt를 구현한다.
- [x] AAD에 user ID, provider, key version을 바인딩한다.
- [x] ciphertext, nonce, auth tag는 base64url로 직렬화한다.
- [x] nested object/Error/header에서 secret 후보를 제거하는 redactor를 만든다.
- [x] crypto module과 AI env module에 `server-only`를 적용한다.
- [x] provider allowlist를 `openai | gemini`로 고정하고 provider를 AAD에 결합한다.

**테스트**

- round-trip, nonce uniqueness, tamper, wrong user/provider/AAD/version
- 빈 key, 잘못된 master key 길이, malformed ciphertext
- 문자열·객체·Error·Authorization header redaction

**Exit**

- DB나 provider 없이 순수 crypto/security test가 통과한다.

---

### Task 5 — `008_ai_document_editing.sql`

**Create**

- `supabase/migrations/008_ai_document_editing.sql`
- `docs/SUPABASE_MIGRATION_008_RUNBOOK.md`
- `tests/security/ai-schema-authorization.test.ts`

**Schema**

- `user_ai_credentials`
- `workspace_ai_policies`
- `ai_analysis_requests`
- `ai_analysis_sources`

**작업**

- [x] UUID, enum/check, timestamps, unique key와 FK delete 정책을 명시한다.
- [x] credential table의 anon/authenticated direct grants를 모두 제거한다.
- [x] policy와 analysis metadata에 필요한 최소 RLS/grants만 둔다.
- [x] browser가 ciphertext나 analysis metadata를 직접 조회하지 못하게 한다.
- [x] view/RPC를 만들 경우 `search_path`와 EXECUTE grant를 명시한다.
- [x] source에는 page ID/revision/label/byte만 저장하고 원문을 저장하지 않는다.

**테스트**

- anon/authenticated credential CRUD 실패
- cross-user/cross-workspace/viewer/removed member 접근 실패
- service-role 경로의 명시적 ownership 검사 fixture
- cascade/restrict가 credential·page·workspace 삭제 정책과 일치

**Exit**

- migration과 DB authorization test가 통과하기 전 credential route를 연결하지 않는다.

---

### Task 6 — Provider interface와 fake provider

**Create**

- `lib/ai/provider-contract.ts`
- `lib/ai/providers/fake.ts`
- `lib/ai/provider-errors.ts`
- `tests/unit/provider-contract.test.ts`
- `lib/ai/prompts/common-rules.ts`
- `lib/ai/prompts/{summary,organize,analysis,question,action-items}.ts`
- `lib/ai/prompt-builder.ts`
- `lib/ai/output-schema.ts`

**계약**

```ts
interface AiProvider {
  verifyCredential(apiKey: string, signal: AbortSignal): Promise<CredentialCheck>
  analyze(input: AnalysisInput, apiKey: string, signal: AbortSignal): Promise<AnalysisOutput>
}
```

**작업**

- [x] credential check, analysis output, usage, request ID, normalized error contract를 만든다.
- [x] deterministic fake provider로 success, invalid key, timeout, 429, malformed output을 재현한다.
- [x] provider raw response가 API 계층 밖으로 나가지 않게 한다.
- [x] 서버 관리형 5개 prompt template과 최대 1,000자 추가 요청 계약을 만든다.
- [x] 공통 structured output schema, 길이/항목/citation validator를 만든다.
- [x] template version과 prompt hash만 metadata로 기록하고 prompt/source 원문은 기록하지 않는다.

**Exit**

- 실제 외부 호출 없이 credential·prompt·analysis 전체 흐름을 테스트할 수 있다.

---

### Task 7 — Credential API

**Create**

- `app/api/ai/credentials/[provider]/route.ts`
- `lib/ai/credential-service.ts`
- credential API tests

**작업**

- [x] GET은 연결 상태, last four, verified/updated time만 반환한다.
- [x] PUT은 fresh auth → bounded body → provider allowlist → fake verify → encrypt → upsert 순서로 처리한다.
- [x] DELETE는 소유자 credential만 삭제한다.
- [x] 모든 응답에 `Cache-Control: no-store`를 적용한다.
- [x] key 원문, ciphertext, nonce/tag와 provider raw error를 응답하지 않는다.
- [x] 동일 사용자의 verify burst를 제한한다.

**Exit**

- Network response와 test logs에서 marker key가 0건이다.

---

### Task 8 — 설정 drawer의 AI 연결 UI

**Modify**

- `components/notion-lite/settings-panel.tsx`
- `components/notion-lite/app-header.tsx`
- `components/notion-lite-app.tsx`
- `lib/notion-lite/api.ts`
- `lib/notion-lite/types.ts`

**Create**

- `components/notion-lite/ai-credential-settings.tsx`

**작업**

- [x] 설정을 계정/워크스페이스/멤버/AI 연결/로그아웃 구역으로 나눈다.
- [x] API key 등록은 별도 화면이 아니라 기존 Settings drawer의 개인 설정 `AI 연결` 구역에 배치한다.
- [x] `내 OpenAI API 키`, `내 Gemini API 키`를 별도 카드로 표시하고 workspace 공용 key로 오해할 표현을 사용하지 않는다.
- [x] password input, 연결 확인, 교체, 삭제와 loading/error 상태를 구현한다.
- [x] 저장 후에는 원문 대신 연결 상태, 마지막 네 자리, 마지막 확인 시각만 표시한다.
- [x] 성공·취소·로그아웃·provider 변경 시 key state를 즉시 비운다.
- [x] 저장된 key 원문 보기·복사 기능은 제공하지 않는다.
- [x] 모바일 drawer 내부 keyboard/scroll/focus 동작을 확인한다.

**Exit**

- 브라우저 state와 DOM에 저장 후 key가 남지 않고 masked status만 보인다.

---

### Task 9 — Workspace AI policy API/UI

**Create**

- `app/api/workspaces/[id]/ai-policy/route.ts`
- `components/notion-lite/workspace-ai-policy.tsx`
- policy API tests

**작업**

- [x] GET은 workspace member에게 현재 policy를 반환한다.
- [x] PATCH는 fresh auth의 owner만 수행한다.
- [x] 기본은 disabled, 저장 provider는 OpenAI/Gemini allowlist, role은 owner/editor로 제한한다. fake adapter는 로컬에서 선택한 실제 provider ID를 모사하며 DB 값으로 저장하지 않는다.
- [x] 설정 drawer에 외부 전송 안내와 명시적 opt-in을 표시한다.
- [x] policy disable 시 DB integrity trigger가 분석 request를 차단하고 기존 credential 삭제 경로는 유지한다.

**Exit**

- owner opt-in 전에는 provider 호출 수가 항상 0이다.

---

### Task 10 — Source 정규화와 선택 UI

**Create**

- `lib/ai/document-source.ts`
- `components/notion-lite/workspace-analysis-dialog.tsx`
- source normalization tests

**Reuse**

- `lib/tiptap-to-plaintext.ts`
- `lib/tiptap-to-markdown.ts`
- page tree/types

**작업**

- [x] 서버에서 page content를 안정적인 분석용 텍스트로 정규화한다.
- [x] 최대 10 pages와 256KiB 합계 제한을 byte 기준으로 적용한다.
- [x] 같은 workspace 여부, membership과 page 존재를 서버가 확인한다.
- [x] source label과 실제 page ID 매핑을 서버 내부에 유지한다.
- [x] UI에서 page 검색·선택·해제와 전송 대상 최종 확인을 제공한다.
- [x] `현재 페이지만`과 `현재 페이지 + 하위 페이지` 선택을 제공하되, 하위 페이지를 자동 전송하지 않고 실제 대상 목록을 확인시킨다.
- [x] 하위 페이지 포함 시에도 최대 10 pages·256KiB 제한을 적용하고 초과 대상은 사용자가 제외하게 한다.
- [x] 요약·정리·분석·질문·액션 아이템 mode와 최대 1,000자 추가 요청 UI를 제공한다.

**Exit**

- 브라우저가 보낸 title/content가 아니라 서버가 조회한 최신 page만 source가 된다.

---

### Task 11 — Fake 분석 API와 결과 UI

**Create**

- `app/api/ai/workspace-analysis/route.ts`
- `app/api/ai/workspace-analysis/[id]/route.ts`
- `lib/ai/analysis-service.ts`
- `components/notion-lite/workspace-analysis-result.tsx`
- analysis API/security tests

**작업**

- [x] fresh auth, role, policy, credential, source를 순서대로 검증한다.
- [x] provider 호출 직전에 membership/policy를 다시 확인한다.
- [x] request ledger와 source revision을 기록한다.
- [x] `(user_id, idempotency_key)` 중복 실행을 차단한다.
- [x] fake output의 source label을 실제 page link로 안전하게 변환한다.
- [x] unknown citation, timeout, 취소와 실패 복구 UI를 구현한다.
- [x] 분석만으로 pages table이 변경되지 않는지 테스트한다.
- [x] 페이지 헤더 대신 사이드바 Utility 진입점과 반응형 오른쪽 Intelligence 패널을 사용한다.
- [x] 분석 중에는 추정 퍼센트 대신 검증 가능한 단계 상태를 표시한다.

**Exit**

- fake provider E2E와 cross-user/workspace 권한 테스트가 통과한다.

---

### Task 12 — OpenAI/Gemini adapter와 제한적 활성화

**Create**

- `lib/ai/providers/openai.ts`
- `lib/ai/providers/gemini.ts`
- provider별 contract tests와 opt-in smoke script

**작업**

- [x] provider별 server allowlist model 하나로 시작한다.
- [x] 최소 권한·최소 비용 credential 검증 방식을 확정한다.
- [x] provider timeout, 401, 429, 5xx, invalid JSON을 normalized error로 변환한다.
- [x] output runtime schema와 citation label을 검증한다.
- [x] usage와 provider request ID만 기록하고 raw prompt/output은 로그하지 않는다.
- [x] live smoke test는 test key가 있을 때만 명시적으로 실행한다.
- [x] Gemini key를 URL query가 아니라 인증 header로 전달한다.
- [x] OpenAI와 Gemini를 독립 feature flag로 순차 활성화하고 자동 fallback하지 않는다.

**Exit**

- fake, OpenAI와 Gemini가 동일 provider contract test를 통과한다.
- Runtime Logs에서 key와 document marker가 0건이다.

---

### Task 13 — Vercel/Supabase release gate

**Modify**

- `.env.example`
- `README.md`
- `docs/WORKSPACE_AI_MANUAL_SETUP_GUIDE.md`
- 필요 시 AI route segment config

**Create**

- `docs/AI_CREDENTIAL_KEY_ROTATION_RUNBOOK.md`
- `docs/AI_PROVIDER_INCIDENT_RUNBOOK.md`
- `docs/AI_WORKSPACE_ANALYSIS_RELEASE_CHECKLIST.md`

**작업**

- [ ] Production/Preview Supabase와 encryption key를 분리한다.
- [ ] Vercel Sensitive env, Deployment Protection, Firewall/rate limit을 확인한다.
- [ ] 이전 deployment의 old master key 접근 차단 절차를 검증한다.
- [ ] key rotation, provider key 유출, provider 장애 rollback을 문서화한다.
- [ ] 내부 한 workspace에만 feature flag를 활성화한다.

**Exit**

- release checklist와 secret scan이 승인되기 전 Production flag를 켜지 않는다.

## 5. 제안 커밋 단위

1. `docs: add secure workspace AI analysis implementation plan`
2. `test: add bounded API and security test foundation`
3. `feat: add page asset baseline migration`
4. `feat: add page content revisions and save coordination`
5. `feat: add encrypted AI credential primitives and schema`
6. `feat: add fake AI provider and credential API`
7. `feat: add AI credential settings UI`
8. `feat: add workspace AI policy controls`
9. `feat: add selected-page analysis with verified sources`
10. `feat: add OpenAI analysis provider behind feature flags`
11. `docs: add AI credential rotation and release runbooks`

## 6. 매 체크포인트 공통 검증

```sh
npm test
npm run test:unit
npm run test:security
npm run typecheck
npm run build
npm audit --omit=dev
git diff --check
```

DB가 필요한 test는 로컬 Supabase 또는 격리된 test project에서만 실행한다. Production DB를 자동 test 대상으로 사용하지 않는다.

## 7. 가장 위험한 지점

1. **service-role 우회:** RLS만 믿으면 안 된다. 모든 API에서 authenticated user와 credential owner/workspace membership을 명시적으로 비교한다.
2. **master key와 DB 동시 유출:** master key는 Vercel Sensitive env, ciphertext는 Supabase로 분리하고 환경별 key를 공유하지 않는다.
3. **로그 노출:** provider client와 error 객체를 그대로 log하지 않고 safe envelope 이전에 공용 redactor를 적용한다.
4. **stale source:** 분석 전에 pending save를 strict flush하고 server revision을 source에 기록한다.
5. **과금 중복:** idempotency와 concurrency 제한 없이 retry UI를 만들지 않는다.
6. **전체 workspace 전송:** MVP는 사용자 선택 최대 10 pages만 허용하고 retrieval은 후속 flag로 분리한다.

## 8. MVP 완료 조건

- migration `006`~`008`이 fresh/기존 test DB에서 통과한다.
- credential key marker가 DB 평문, Network response, Runtime Logs에 0건이다.
- 다른 사용자·workspace·viewer·제거된 멤버의 우회가 모두 실패한다.
- owner opt-in과 개인 credential이 모두 있어야 분석이 실행된다.
- 선택한 최대 10개 최신 page만 provider에 전달된다.
- 결과 source가 실제 page link와 일치하고 unknown source는 거부된다.
- 분석 실행으로 원본 page가 변경되지 않는다.
- duplicate request가 provider를 한 번만 호출한다.
- Preview/Production 환경과 encryption key가 분리된다.
- mobile/desktop 설정과 분석 UI의 keyboard 기본 동작이 검증된다.
