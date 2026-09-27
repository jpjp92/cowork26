# 사용자 API Key 기반 워크스페이스 분석 계획

**작성일:** 2026-09-26
**상태:** 기획 완료 · 구현 전
**연결 계획:** `PLAN_20260830_AI_DOCUMENT_EDITING.md`, `PLAN_20260831_AI_DOCUMENT_EDITING_FOUNDATION_SECURITY.md`
**대상:** 개인 BYOK credential, workspace AI policy, 선택 문서 분석, 검색형 workspace 질의

구체적인 파일·테스트·배포 순서는 `PLAN_20260926_WORKSPACE_AI_ANALYSIS_IMPLEMENTATION.md`를 따르고, prompt/provider 계약은 `PLAN_20260927_AI_PROMPT_PROVIDER_ARCHITECTURE.md`를 따른다.

## 1. 결론

사용자가 자신의 AI provider API key를 등록하고, 허용된 workspace 문서를 분석할 수 있게 한다. API key는 workspace 공동 자산이 아니라 `(user_id, provider)` 기준 개인 credential로 관리한다. 다른 멤버와 owner도 key 원문을 조회하거나 대신 사용할 수 없다.

첫 버전은 workspace 전체를 자동 전송하지 않는다. 사용자가 직접 선택한 최대 10개 문서만 분석하고 결과에 출처 page를 표시한다. 이 흐름과 credential 보안이 검증된 뒤 keyword retrieval, 이후 필요할 때만 embedding 기반 검색으로 확장한다.

실제 provider 호출은 기존 AI 기반 계획의 credential 암호화, DB 권한, Vercel 환경 분리와 secret scan을 모두 통과한 뒤 활성화한다.

## 2. 목표

- 사용자가 자신의 OpenAI와 Gemini API key를 각각 등록·검증·교체·삭제할 수 있다.
- key 원문이 DB, API 응답, 브라우저 저장소, 로그와 다른 사용자에게 노출되지 않는다.
- workspace owner가 외부 AI 전송 사용 여부와 실행 가능한 역할을 관리한다.
- 허용된 사용자가 직접 선택한 문서를 요약하거나 질문할 수 있다.
- 결과에 사용한 page 제목과 링크를 출처로 표시한다.
- 분석 실행만으로 원본 page title/content가 바뀌지 않는다.
- membership 상실, policy 비활성화, credential 삭제 시 새 분석을 즉시 차단한다.
- 중복 호출과 과도한 비용을 idempotency, rate limit, 문서 수·크기 제한으로 제어한다.

## 3. 제외 범위

- 사용자 API key를 workspace 멤버가 공동 사용
- workspace 전체 문서를 매 요청마다 provider에 일괄 전송
- 분석 결과의 원본 문서 자동 적용
- tool call, web search, DB query 생성 및 실행
- provider 자동 fallback과 결제 대행
- 첫 버전의 embedding/vector database
- shared prompt·shared analysis history
- 이미지 OCR, 음성·영상 분석
- AI가 workspace 권한이나 membership을 변경하는 기능

## 4. 고정 결정

### Credential

- credential 소유 단위는 `(user_id, provider)`다.
- 저장된 key는 다시 표시하지 않고 연결 상태, provider, 마지막 네 자리, 갱신 시각만 반환한다.
- 브라우저 `localStorage`, `sessionStorage`, cookie와 URL에는 key를 저장하지 않는다.
- key 입력 state는 성공·취소·로그아웃·workspace 전환 시 즉시 제거한다.
- credential schema와 Settings는 OpenAI/Gemini를 지원한다.
- 실제 provider는 fake → OpenAI → Gemini 순서로 검증하고 독립 flag로 활성화한다.

### 권한

- workspace AI policy 기본값은 `enabled=false`다.
- owner만 policy와 허용 역할을 변경할 수 있다.
- 기본 실행 역할은 owner/editor이며 viewer는 명시적 검토 전까지 제외한다.
- 분석 요청마다 Supabase Auth user, membership, role, policy, provider allowlist, credential ownership을 서버에서 다시 확인한다.
- 요청 body의 `userId`, role, workspace ownership 주장은 신뢰하지 않는다.

### 문서 전송

- 1차는 사용자가 직접 선택한 동일 workspace page만 사용한다.
- 최대 10개 page, 정규화 본문 합계 최대 256KiB를 1차 안전 상한으로 둔다.
- 서버가 page를 다시 조회하고 membership을 검사하며, 브라우저가 보낸 본문 원문은 사용하지 않는다.
- provider 입력에는 page ID 대신 provider용 opaque source label을 사용한다.
- 결과에는 서버가 opaque label을 실제 page title/URL로 다시 매핑해 출처를 표시한다.
- 분석 직전 최종 source 목록과 외부 전송 안내를 사용자에게 보여준다.

### 결과

- 초기 기능은 요약, 정리, 분석, 질문 답변, 액션 아이템 추출로 제한한다.
- 사용자는 system prompt 전체가 아니라 최대 1,000자의 추가 요청만 입력한다.
- 서버 prompt는 공통 보안 규칙과 mode별 versioned template로 관리한다.
- 결과는 생성자 개인 데이터로 저장하거나, 보관 정책이 확정되기 전에는 응답 후 저장하지 않는다.
- provider 응답은 runtime schema로 검증하고 raw HTML, script와 unsafe URL을 거부한다.
- 답변에 출처가 없거나 존재하지 않는 source label이 포함되면 명확히 표시하고 자동 링크하지 않는다.

## 5. 보안 경계

### 5.1 브라우저

- key 입력은 `type=password`, `spellCheck=false`, 명시적인 붙여넣기 허용으로 구성한다.
- key를 DOM attribute, toast, error message와 analytics event에 넣지 않는다.
- 저장 API 성공 후 입력값을 즉시 비우고 마스킹 상태만 표시한다.
- credential 조회 API는 ciphertext, nonce, 마지막 네 자리를 제외한 key 파생 정보를 반환하지 않는다.
- CSP를 강화하고 credential 화면에는 불필요한 third-party script를 추가하지 않는다.

### 5.2 Next.js 서버

- credential API와 provider adapter는 `server-only` module에서만 key를 다룬다.
- Supabase access token을 서버에서 재검증하고 fresh-auth가 필요한 endpoint를 구분한다.
- request/response body, Authorization header, provider request config와 raw error를 로그에 기록하지 않는다.
- credential 관련 응답에 `Cache-Control: no-store`를 사용한다.
- key는 provider 호출 직전에 복호화하고 closure/global cache/queue payload에 담지 않는다.
- background job으로 확장할 경우 plaintext가 아니라 credential ID만 전달한다.
- provider timeout은 platform hard timeout보다 짧게 설정하고 종료 상태를 정규화한다.

### 5.3 Supabase DB/Auth

- `user_ai_credentials`는 RLS를 활성화하고 `PUBLIC`, `anon`, `authenticated`의 직접 CRUD grant를 제거한다.
- server API의 service-role만 credential ciphertext를 읽고 쓴다.
- service-role은 RLS를 우회하므로 API가 반드시 `credential.user_id === authenticatedUser.id`를 확인한다.
- ciphertext, nonce, auth tag, key version과 최소 metadata만 저장한다.
- credential master key는 DB와 migration, SQL function에 저장하지 않는다.
- policy와 analysis record도 cross-workspace/cross-user 테스트를 통과해야 한다.
- view와 RPC는 기본 공개 `EXECUTE`/`SELECT` grant를 점검하고 필요한 역할만 허용한다.

### 5.4 Vercel

- `AI_CREDENTIAL_ENCRYPTION_KEY_V1`과 Supabase server secret을 Sensitive Environment Variable로 등록한다.
- 어떤 secret에도 `NEXT_PUBLIC_` 접두어를 사용하지 않는다.
- Production과 Preview의 Supabase project와 encryption key를 분리한다.
- master key에는 version을 두고 신규 write와 기존 read를 분리해 점진 회전한다.
- env 변경 후 새 deployment와 이전 deployment 차단 절차를 실행한다.
- Vercel project/team/CI 접근 권한과 Runtime Log/Log Drain 접근을 최소화한다.
- AI endpoint에 사용자·IP rate limit과 동시 실행 제한을 적용한다.

### 5.5 암호화 계약

- AES-256-GCM을 사용한다.
- 매 credential write마다 cryptographically secure random nonce를 생성하고 재사용하지 않는다.
- AAD는 `cowork26:user-ai-credential:v1:{userId}:{provider}:{keyVersion}` 형식을 사용한다.
- DB에는 `ciphertext`, `nonce`, `auth_tag`, `key_version`을 저장한다.
- 잘못된 AAD, nonce/tag 변조, 잘못된 key version은 모두 복호화 실패로 처리한다.
- 복호화 오류는 key 원문이나 암호 상세 없이 일반화된 오류 code로 반환한다.

## 6. 데이터 모델 초안

기존 AI 기반 계획의 다음 테이블을 재사용한다.

### `user_ai_credentials`

- `id`, `user_id`, `provider`
- `ciphertext`, `nonce`, `auth_tag`, `key_version`
- `key_last_four`, `verified_at`, `last_used_at`
- `created_at`, `updated_at`
- unique `(user_id, provider)`

### `workspace_ai_policies`

- `workspace_id`
- `enabled`
- `allowed_providers`
- `allowed_roles`
- `updated_by`, `updated_at`

워크스페이스 분석 확장 시 다음 테이블을 추가하거나 기존 generation ledger를 purpose 기반으로 확장한다.

### `ai_analysis_requests`

- `id`, `workspace_id`, `created_by`, `provider`, `status`
- `analysis_type`, `prompt_hash`, `idempotency_key`
- `source_count`, `source_bytes`
- `provider_request_id`, 정규화된 usage와 error code
- `created_at`, `started_at`, `completed_at`, `expires_at`

### `ai_analysis_sources`

- `request_id`, `page_id`, `content_revision`
- `source_label`, `source_order`, `normalized_bytes`
- 원문 본문 복제 저장은 하지 않는다.

분석 결과 저장 여부와 보관 기간은 개인정보·비용 요구를 확정한 뒤 결정한다. 기본값은 최소 보관이다.

## 7. API 계약 초안

```text
GET    /api/ai/credentials/:provider       # 연결 상태만 반환
PUT    /api/ai/credentials/:provider       # key 검증 후 암호화 저장·교체
DELETE /api/ai/credentials/:provider       # credential 삭제

GET    /api/workspaces/:id/ai-policy       # 현재 policy
PATCH  /api/workspaces/:id/ai-policy       # owner 전용

POST   /api/ai/workspace-analysis          # 선택 page 분석 실행
GET    /api/ai/workspace-analysis/:id      # 생성자 전용 상태·결과
DELETE /api/ai/workspace-analysis/:id      # 취소 또는 결과 삭제
```

공통 규칙:

- mutation JSON은 공통 bounded body parser를 사용한다.
- provider, model, analysis type은 server allowlist로 검증한다.
- page ID 배열은 최대 10개이며 중복·UUID 형식·동일 workspace 여부를 검사한다.
- `Idempotency-Key`를 요구하고 `(user_id, key)` 중복 provider 호출을 차단한다.
- provider 오류는 `invalid_credential`, `rate_limited`, `timeout`, `provider_unavailable`, `invalid_output` 등 내부 code로 변환한다.
- provider raw error와 Authorization header는 클라이언트에 반환하지 않는다.

## 8. 사용자 흐름

### 개인 API key 연결

1. 사용자가 기존 Settings drawer의 개인 설정 `AI 연결` 구역을 연다.
2. `내 OpenAI API 키` 또는 `내 Gemini API 키` 입력란에서 개인 key임을 확인한다.
3. provider와 API key를 입력하고 `연결 확인`을 누른다.
4. 서버가 최소 권한·최소 비용 방식으로 provider key를 검증한다.
5. 성공하면 암호화 저장하고 입력값을 비운다.
6. UI는 `연결됨 · 끝 4자리 · 확인 시각`만 표시한다.
7. 사용자는 key 교체 또는 삭제를 실행할 수 있다.

### 선택 문서 분석

1. 사용자가 workspace에서 `문서 분석`을 연다.
2. 최대 10개 page를 선택한다.
3. 다섯 분석 mode 중 하나를 고르고 필요한 경우 제한된 추가 요청을 입력한다.
4. 외부 전송 대상 page와 provider를 최종 확인한다.
5. 서버가 최신 page와 권한을 다시 조회해 provider를 호출한다.
6. 결과와 출처 page 링크를 표시한다.
7. 결과는 원본 page에 자동 반영하지 않는다.

## 9. 단계별 구현 계획

### W0 — 선행 보안 기반

**의존:** 기존 AI 기반 계획 F0~F2, 입력·요청 크기 제한 계획

- [ ] page revision과 strict save flush를 구현한다.
- [ ] AI schema, credential AES-GCM과 redactor를 구현한다.
- [ ] credential table direct browser CRUD를 차단한다.
- [ ] Production/Preview Supabase와 encryption key를 분리한다.
- [ ] fake provider와 DB authorization tests를 준비한다.

**Exit:** 실제 provider를 호출하지 않고 credential 암호화·권한·로그 검증이 통과한다.

### W1 — 개인 Credential UI/API

- [ ] 설정 drawer에 `AI 연결` 구역을 추가한다.
- [ ] OpenAI/Gemini key 등록·검증·교체·삭제 API를 구현한다.
- [ ] 성공 후 입력 state 제거와 마스킹 상태 표시를 구현한다.
- [ ] invalid key, timeout, rate limit 오류를 원문 없이 구분한다.
- [ ] credential lifecycle audit event를 key 원문 없이 기록한다.

**Exit:** Network, DB dump, Runtime Logs와 오류 응답에서 test key marker가 0건이다.

### W2 — 선택 문서 분석 MVP

- [ ] owner가 workspace AI policy를 opt-in할 수 있게 한다.
- [ ] page 선택기와 최대 10개 제한을 구현한다.
- [ ] 요약, 정리, 분석, 질문 답변, 액션 아이템 prompt contract를 정의한다.
- [ ] 공통 structured output schema와 citation validator를 구현한다.
- [ ] fake provider로 source mapping과 citation UI를 검증한다.
- [ ] OpenAI/Gemini adapter를 독립 flag로 연결하고 usage·timeout·idempotency를 기록한다.
- [ ] 결과가 원본 page를 변경하지 않는지 검증한다.

**Exit:** 권한이 있는 사용자가 선택한 문서만 전송되고 모든 답변의 출처가 실제 page로 검증된다.

### W3 — 검색형 Workspace 분석

- [ ] title과 정규화 평문을 대상으로 server-side keyword retrieval을 구현한다.
- [ ] 질문에 관련된 후보 page와 snippet을 사용자에게 먼저 보여준다.
- [ ] 사용자가 전송 대상을 확인·수정한 뒤 provider를 호출한다.
- [ ] page revision 변경 시 stale source를 감지한다.
- [ ] 검색 결과 품질, 비용과 latency를 측정한다.

**Exit:** 전체 workspace를 무조건 전송하지 않고 관련 source만 선택하며 출처 누락과 권한 우회가 없다.

### W4 — Embedding/RAG 검토

- [ ] W3의 검색 실패율과 workspace 규모 분포를 측정한다.
- [ ] keyword retrieval로 부족한 경우에만 embedding 도입 여부를 결정한다.
- [ ] chunking, embedding model/version, 재색인, 삭제와 retention 정책을 설계한다.
- [ ] membership 변경과 page 삭제 시 index 접근·정리 경계를 검증한다.

**Exit:** 측정 근거와 운영 비용 없이 vector infrastructure를 먼저 도입하지 않는다.

## 10. 필수 보안 테스트

### Credential

- [ ] AES-GCM round-trip, nonce uniqueness, tamper, wrong AAD, wrong key version
- [ ] DB dump, API response, browser state와 로그에 test key marker 0건
- [ ] 사용자 A가 사용자 B credential 상태·ciphertext·사용·삭제에 접근 실패
- [ ] credential 교체 후 이전 key로 신규 암호문 복호화 불가
- [ ] credential 삭제 후 신규 분석 차단
- [ ] provider raw error와 Authorization header redaction

### Workspace 권한

- [ ] viewer, removed member, disabled policy, disallowed provider/role 거부
- [ ] cross-workspace page ID와 존재하지 않는 page ID 거부
- [ ] 분석 시작과 provider 호출 직전 membership 재검증
- [ ] analysis request/result는 생성자 외 접근 실패
- [ ] service-role 경로에서 명시적 ownership 검사 누락 탐지

### 비용·안정성

- [ ] 중복 idempotency key가 provider를 한 번만 호출
- [ ] 11개 page, 256KiB 초과, 중복 ID와 잘못된 UUID 거부
- [ ] provider timeout, 429, 5xx와 invalid output 상태 복구
- [ ] 브라우저 취소가 provider 과금 취소를 보장하지 않음을 UI에 표시
- [ ] 사용자별 rate·concurrency 제한 우회 실패

## 11. Vercel·Supabase 운영 체크리스트

운영자가 직접 수행할 SQL 적용 순서와 Vercel 설정 절차는 [워크스페이스 AI 수동 설정 가이드](../WORKSPACE_AI_MANUAL_SETUP_GUIDE.md)에서 별도로 관리한다. 아직 생성되지 않은 migration은 선행 실행하지 않는다.

### Supabase

- [ ] migration 전 remote schema drift 확인
- [ ] AI table RLS enabled 및 anon/authenticated grants 제거
- [ ] view/RPC default privileges와 `SECURITY DEFINER` search path 점검
- [ ] service-role/secret key가 브라우저 bundle과 응답에 없음
- [ ] DB backup에서도 credential은 ciphertext로만 존재

### Vercel

- [ ] encryption key와 Supabase server secret을 Sensitive로 등록
- [ ] Production/Preview 환경과 key 완전 분리
- [ ] env 변경 후 신규 deployment와 이전 deployment 차단 확인
- [ ] Preview Deployment Protection 적용
- [ ] AI endpoint Firewall/rate rules 적용
- [ ] Runtime Logs와 Log Drain에서 key/document marker 0건
- [ ] project/team/CI 권한 최소화 및 퇴사자 접근 제거 절차 확인

## 12. Rollout

1. `AI_FEATURE_ENABLED=false`로 schema와 crypto만 배포한다.
2. fake provider로 credential·policy·analysis 권한 테스트를 수행한다.
3. 내부 사용자 한 명과 전용 Preview 환경에서 test key를 연결한다.
4. Production의 한 workspace에 OpenAI 선택 문서 분석만 활성화한다.
5. 오류율, 비용, latency, citation 실패와 secret scan을 확인한다.
6. workspace 범위를 점진 확대한다.
7. keyword retrieval은 W2 안정화 이후 별도 flag로 활성화한다.

Rollback은 분석 실행만 차단하되 사용자가 credential을 삭제할 수 있는 경로는 유지한다. credential 유출 의심 시 feature flag 차단 → master key rotation → provider key 폐기 안내 → 로그·DB marker 조사 → 신규 deployment 순으로 대응한다.

## 13. 완료 조건

- 사용자 API key가 브라우저 저장소, DB 평문, API 응답과 로그에 남지 않는다.
- 다른 사용자와 workspace 멤버가 credential을 조회하거나 대신 사용할 수 없다.
- owner opt-in 전에는 어떤 workspace 문서도 provider로 전송되지 않는다.
- 사용자가 확인한 source page만 분석하며 결과에 검증된 출처를 표시한다.
- membership·policy·credential 변경이 다음 분석부터 즉시 반영된다.
- 원본 page는 분석만으로 변경되지 않는다.
- rate limit, idempotency, 크기 제한과 provider timeout이 검증된다.
- Production/Preview 환경 분리와 secret scan을 통과한다.

## 14. 미확정 결정

- 분석 결과를 저장할지, 저장한다면 보관 기간을 얼마로 할지
- viewer에게 분석 실행을 허용할지
- W2에서 사용할 OpenAI model allowlist와 사용자 선택 허용 범위
- provider key 검증에 사용할 최소 비용 endpoint
- 10개 page·256KiB 상한을 실제 문서 크기 분포에 맞춰 조정할지
- workspace 분석 진입점을 sidebar, 검색 modal 또는 별도 panel 중 어디에 둘지
