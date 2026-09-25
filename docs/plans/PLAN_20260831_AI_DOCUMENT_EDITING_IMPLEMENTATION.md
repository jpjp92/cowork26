# AI 문서 편집 기능 구현 계획

> 상위 계획: [AI 문서 편집 Master Roadmap](./PLAN_20260830_AI_DOCUMENT_EDITING.md)
> 선행 계획: [기반·DB·보안 계획](./PLAN_20260831_AI_DOCUMENT_EDITING_FOUNDATION_SECURITY.md)
> 상태: 기반 exit criteria 통과 후 실행
> 범위: 문서 변환, provider adapter, API, draft, UI, apply, 검증

## 1. 기능 범위

- 사용자별 OpenAI, Gemini, Anthropic credential 설정
- owner의 workspace AI enable/provider/role 정책
- 최신 원본 기반 private AI draft 생성
- draft 조회·편집·자동저장·삭제
- revision-aware 원본 적용
- 이미지 clone을 포함한 새 페이지 저장

제외: multi-page, selection AI, tool call, shared draft, 3-way merge, long-document chunking, provider fallback.

## 2. 핵심 계약

### Provider input/output

```ts
interface TransformDocumentInput {
  title: string
  bodyMarkdown: string
  instruction: string
  requestedIntent?: AiIntent
  model: string
}

interface TransformDocumentResult {
  intent: AiIntent
  title: string
  bodyMarkdown: string
  changeSummary: string[]
  warnings: string[]
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}
```

- title과 body Markdown을 분리해 중복 H1을 만들지 않는다.
- download export와 AI body-only export를 분리한다.
- output은 runtime schema와 size/depth/node limits를 통과해야 한다.

### Provider adapter

```ts
interface AiDocumentProvider {
  testCredential(input: { apiKey: string; signal: AbortSignal }): Promise<void>
  transformDocument(
    apiKey: string,
    input: TransformDocumentInput,
    signal: AbortSignal,
  ): Promise<TransformDocumentResult>
}
```

- official REST API를 server-only adapter에서 호출한다.
- user-supplied endpoint와 tool call을 금지한다.
- model은 server allowlist로 검증한다.
- structured output 뒤에도 공통 runtime validation을 수행한다.
- provider raw error/response는 저장하거나 반환하지 않는다.

## 3. Target Structure

```text
app/api/ai/settings/{route.ts,test/route.ts}
app/api/ai/workspace-policy/route.ts
app/api/ai/generations/{route.ts,[id]/route.ts}
app/api/ai/drafts/{route.ts,[id]/route.ts,[id]/apply/route.ts}

lib/ai/{contracts,credential-crypto,credential-redaction}.ts
lib/ai/{provider-config,provider-registry,prompt,result-validation}.ts
lib/ai/{protected-nodes,page-source,apply-draft}.ts
lib/ai/providers/{openai,gemini,anthropic}.ts

lib/document/{tiptap-types,tiptap-body-to-markdown}.ts
lib/document/{markdown-to-tiptap,sanitize-document}.ts

hooks/use-ai-settings.ts
hooks/use-workspace-ai-policy.ts
hooks/use-ai-drafts.ts

components/notion-lite/ai-provider-settings.tsx
components/notion-lite/workspace-ai-policy.tsx
components/notion-lite/ai-document-pane.tsx
components/notion-lite/ai-draft-toolbar.tsx
```

## 4. Document Conversion

- `unified + remark-parse + remark-gfm` AST adapter로 pure Markdown parser를 만든다.
- clipboard parser와 AI parser가 core conversion을 공유한다.
- clipboard 전용 code detection, image upload/clone은 component adapter에 남긴다.
- raw HTML은 버리거나 plain text로 처리한다.
- URL은 `http`, `https`, 필요한 경우 `mailto`만 허용한다.
- AI가 새로 만든 image Markdown은 거부한다.
- nested list, table, fenced code, Mermaid, hard break, link/marks를 fixture로 검증한다.
- rowHeight/colWidth 같은 table layout attr는 MVP 보존 대상이 아니다.

### Protected nodes

- 요청마다 random token namespace를 생성한다.
- image의 asset ID/Storage URL 대신 opaque token만 provider에 보낸다.
- token multiset의 누락·중복·변조·미등록 값을 거부한다.
- source JSON과 `page_assets` 관계를 확인한 뒤 image attrs 전체를 복원한다.

## 5. API

모든 민감 응답은 `Cache-Control: no-store`와 공통 error envelope를 사용한다.

```json
{ "error": { "code": "AI_DRAFT_CONFLICT", "message": "원본 문서가 변경되었습니다.", "requestId": "uuid" } }
```

### Credentials

```text
GET    /api/ai/settings
PUT    /api/ai/settings
DELETE /api/ai/settings?provider=openai
POST   /api/ai/settings/test
```

- GET은 provider, connected, key hint, default model, verified time만 반환한다.
- PUT은 credential test 성공 후 암호화 저장한다.
- test/PUT/DELETE는 fresh auth와 per-user rate limit을 사용한다.

### Workspace policy

```text
GET   /api/ai/workspace-policy?workspaceId=...
PATCH /api/ai/workspace-policy
```

- member는 공개 상태 조회, owner만 수정한다.
- enable 시 notice version을 저장한다.

### Generation

```text
POST /api/ai/generations
GET  /api/ai/generations/{id}
```

입력은 `pageId, provider, model, instruction, requestedIntent, expectedSourceRevision, idempotencyKey`다. content/workspace/role/usage는 서버가 조회한다.

처리 순서:

1. fresh auth와 page/workspace/role/policy 확인
2. expected/source revision 비교
3. idempotency row 조회 또는 생성
4. 본인 credential decrypt
5. protected body Markdown, size/rate/concurrency 검증
6. provider 호출
7. output/URL/token 검증과 Tiptap 변환
8. private draft 저장, request success 처리
9. allowlisted response 반환

### Drafts and apply

```text
GET    /api/ai/drafts?pageId=...
GET    /api/ai/drafts/{id}
PATCH  /api/ai/drafts/{id}
DELETE /api/ai/drafts/{id}
POST   /api/ai/drafts/{id}/apply
```

- PATCH는 draft title/content만 허용한다.
- replace-original은 atomic RPC를 사용한다.
- create-page는 parent/workspace를 검증하고 모든 image asset을 새 page로 clone한다.
- clone partial failure는 page, DB rows, Storage objects를 보상 정리한다.
- already-applied request와 retry를 idempotent하게 처리한다.

## 6. UI

### Settings

- `AiProviderSettings`: connect/test/replace/delete와 key hint/default model
- `WorkspaceAiPolicy`: owner controls, non-owner read-only state
- key input은 password/autocomplete off
- 성공, panel close, workspace switch, logout 시 key input 제거
- provider 비용과 외부 문서 전송 안내

### Original / AI tabs

- accessible `tablist/tab/tabpanel`
- AI tab 진입 자체는 provider를 호출하지 않는다.
- provider/model/preset/instruction controls
- active page strict flush 후 generation
- request ID 기반 generating/succeeded/failed/stale 복구
- editable draft editor와 별도 save badge
- summary/warnings/retry/apply actions
- conflict 시 다시 생성, 새 페이지 저장, draft 유지 제공
- viewer/policy-disabled 이유 표시

### 접근성

- status/error에 `aria-live`, `role=status/alert`
- keyboard focus, Escape/Enter, disabled reason
- 320px mobile overflow
- 색상 외 text/icon으로 상태 전달

## 7. Error Codes

```text
AUTH_REQUIRED, FORBIDDEN, VALIDATION_ERROR, PAGE_REVISION_CONFLICT
AI_CREDENTIAL_NOT_CONFIGURED, AI_CREDENTIAL_INVALID, AI_CREDENTIAL_DECRYPT_FAILED
AI_WORKSPACE_DISABLED, AI_PROVIDER_NOT_ALLOWED, AI_ROLE_NOT_ALLOWED, AI_MODEL_NOT_ALLOWED
AI_REQUEST_DUPLICATE, AI_REQUEST_IN_PROGRESS, AI_REQUEST_RATE_LIMITED
AI_PROVIDER_RATE_LIMITED, AI_PROVIDER_UNAVAILABLE, AI_REQUEST_TIMEOUT
AI_INPUT_TOO_LARGE, AI_OUTPUT_INVALID, AI_UNSAFE_LINK
AI_PROTECTED_NODE_MISMATCH, AI_DRAFT_CONFLICT, AI_ASSET_CLONE_FAILED
```

로그에는 request ID, code, provider, duration, char/token count만 남긴다.

## 8. Ordered Tasks

### I0 — Pure document conversion

**Create:** `lib/document/*`, `tests/document/*`
**Modify:** `components/document-editor.tsx`, `lib/tiptap-to-markdown.ts`

- [ ] Markdown AST dependencies와 pure parser
- [ ] download title/AI body export 분리
- [ ] raw HTML, unsafe URL, model image 차단
- [ ] existing paste characterization과 round-trip fixtures
- [ ] node/depth/size validation

**Exit:** browser DOM 없이 AI conversion tests가 실행되고 paste 회귀가 없다.

### I1 — Credential API와 workspace policy

**Create:** provider config, settings/policy routes/hooks/components, API/UI tests
**Modify:** settings panel, app header/state, notion-lite API/types

- [ ] 기반 계획의 versioned crypto primitive를 settings API에 연결
- [ ] credential test/list/replace/delete
- [ ] member-read/owner-write workspace policy
- [ ] key input cleanup과 Network/state secret inspection

**Exit:** owner opt-in 전 generation이 차단되고 key/암호문이 browser에 없다.

### I2 — Fake provider generation core

**Create:** contracts/prompt/validation/protected nodes/page source/registry, generation routes/tests

- [ ] server source와 expected revision
- [ ] fake success/error/timeout/invalid output
- [ ] idempotency, user concurrency/rate limit, stale recovery
- [ ] generation 중 `pages` 불변 test
- [ ] cross-user/workspace/viewer/policy bypass tests

**Exit:** 외부 API 없이 generation → private draft가 완성된다.

### I3 — OpenAI first E2E

- [ ] 구현 시 공식 endpoint/auth/structured output 확인
- [ ] credential test와 transform adapter
- [ ] timeout/401/429/5xx/malformed normalization
- [ ] server model allowlist
- [ ] fixture tests와 opt-in live smoke test
- [ ] Vercel logs에서 key/document marker 0건 확인

**Exit:** OpenAI draft 생성과 reload 복구가 동작한다.

### I4 — Draft persistence와 AI tabs

- [ ] draft list/single/PATCH/delete와 field allowlist
- [ ] draft autosave serialization
- [ ] Original/AI tabs와 controls/status/editor
- [ ] original/draft save state 분리
- [ ] page 이동/logout/workspace switch cleanup

**Exit:** draft 편집·복구가 원본 persistence와 분리된다.

### I5 — Apply and asset compensation

- [ ] atomic replace-original RPC 연결
- [ ] apply 직전 fresh permission/policy 확인
- [ ] 409 conflict UX
- [ ] create-page image clone/attr remap
- [ ] partial failure compensation
- [ ] apply idempotency와 client cache/revision sync

**Exit:** race/clone failure에도 원본 손실과 orphan object가 없다.

### I6 — Gemini and Anthropic

- [ ] 구현 시 공식 contracts 확인
- [ ] common adapter contract tests
- [ ] auth/output/usage/error mapping
- [ ] input/timeout/model allowlist
- [ ] policy/settings와 opt-in live smoke

**Exit:** 세 provider가 같은 내부 contract를 통과한다.

### I7 — Release hardening

- [ ] sanitized logging/alerts와 request ID
- [ ] retention/stale cleanup runbook 또는 job
- [ ] key rotation/provider incident runbooks
- [ ] feature flag internal → one workspace → wider rollout
- [ ] generation-only rollback과 draft recovery

## 9. Verification

```bash
npm test
npm run test:unit
npm run test:api
npm run typecheck
npm run build
```

Automated:

- crypto/AAD/redaction
- parser/sanitizer/protected token round-trip
- revision conflict와 strict flush
- generation auth/idempotency
- provider fixtures
- atomic apply race
- asset compensation
- response allowlist/no-store

Manual:

- Network/Runtime Logs secret scan
- forced provider 401/429/5xx/timeout
- prompt injection no-tool 확인
- unsafe link/image 차단
- mobile/desktop/keyboard
- page 이동 status 복구
- dirty original generation과 conflict data preservation

## 10. Exit Criteria

- OpenAI → Gemini → Anthropic이 공통 contract를 통과한다.
- generation만으로 page title/content/revision이 바뀌지 않는다.
- strict flush 실패 시 provider가 호출되지 않는다.
- draft는 private하며 reload 후 복구된다.
- stale apply는 transaction에서 409다.
- create-page asset clone과 compensation이 검증된다.
- user/provider rate limit과 idempotency가 중복 과금을 막는다.
- 전체 tests/typecheck/build와 Vercel release checklist가 통과한다.
