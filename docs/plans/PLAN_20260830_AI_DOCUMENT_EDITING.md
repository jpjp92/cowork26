# AI 문서 편집 Master Roadmap

> 최초 작성: 2026-08-30
> 재정리: 2026-08-31
> 상태: 설계 확정, 선행 기반 작업부터 착수
> 범위: 사용자 API 키 기반 OpenAI·Gemini·Anthropic 문서 편집

## 1. 문서 구성

이 파일은 전체 목표, 고정 결정, 마일스톤과 release 기준만 관리한다. 상세 체크리스트는 다음 문서가 source of truth다.

- [기반·DB·보안 계획](./PLAN_20260831_AI_DOCUMENT_EDITING_FOUNDATION_SECURITY.md)
  - page revision, migrations, AI tables, RLS/grants, credential crypto, Vercel
- [기능 구현 계획](./PLAN_20260831_AI_DOCUMENT_EDITING_IMPLEMENTATION.md)
  - document conversion, provider adapters, API, draft UI, apply, tests

중복 내용이 발견되면 세부 설계는 하위 문서를 따르고, 범위·우선순위·릴리스 판단은 이 Master Roadmap을 따른다.

## 2. Goal

- 사용자가 자신의 OpenAI, Gemini, Anthropic API 키를 등록·검증·교체·삭제한다.
- owner가 workspace 문서의 외부 AI 전송, 허용 provider, 실행 역할을 관리한다.
- 허용된 owner/editor가 최신 원본으로 private AI draft를 생성한다.
- draft 생성·편집만으로 원본 page가 바뀌지 않는다.
- 명시적 적용 시 revision을 검사해 원본을 바꾸거나 새 page를 만든다.
- API key, 문서, instruction, provider raw error가 응답·로그에 노출되지 않는다.

## 3. Non-goals

- 여러 page/workspace 일괄 처리
- selection AI와 shared draft
- tool call, web search, DB/MCP/사내 시스템 호출
- 자동 3-way merge와 long-document chunking
- provider 자동 fallback과 결제 대행
- Yjs/Hocuspocus 실시간 공동편집
- legacy `/api/agi` 기능과의 통합

## 4. Current Blockers

AI 기능 전에 해결해야 한다.

1. `page_assets`가 정식 migration에 없다.
2. page title/content가 revision 없이 전체 덮어쓰기 된다.
3. debounce 저장 전에 generation하면 서버가 stale source를 읽을 수 있다.
4. service-role, auth cache, error/logging 경계를 credential 처리 수준으로 강화해야 한다.
5. Markdown import가 component/DOM과 결합되어 server conversion에 재사용하기 어렵다.
6. workspace AI policy enable API/UI가 없으면 `enabled=false` 상태에서 generation이 모두 막힌다.
7. Preview와 Production의 Supabase/encryption key가 분리되어야 한다.
8. 통합 tests, DB authorization tests, Vercel release checklist가 없다.

## 5. Fixed Decisions

### 데이터와 권한

- credential은 `(user_id, provider)` 기준 개인 데이터다.
- workspace policy 기본값은 `enabled=false`다.
- 실행에는 credential, workspace enabled, provider allowlist, role allowlist, page membership이 모두 필요하다.
- draft는 생성자 개인 데이터이며 membership 상실 시 접근/apply를 차단한다.

### 원본 보호

- `pages.content_revision`은 title/content 변경에만 증가한다.
- 일반 save와 AI apply 모두 base revision을 검사한다.
- generation은 `pages`를 UPDATE하지 않는다.
- replace-original은 DB transaction/RPC에서 revision을 비교한다.
- create-page는 image asset을 target page 전용으로 clone하고 실패 시 보상 정리한다.

### 문서 계약

- provider input/output에서 `title`과 `bodyMarkdown`을 분리한다.
- raw HTML, unsafe URL, model-generated image를 거부한다.
- source image는 opaque protected token으로 왕복한다.
- AI에 search/function/file/DB tool을 연결하지 않는다.

### 실행과 비용 보호

- MVP는 synchronous route + generation ledger로 시작한다.
- `(user_id, idempotency_key)`로 duplicate provider call을 차단한다.
- application user rate/concurrency limit과 Vercel WAF를 병행한다.
- browser cancellation은 provider 과금 취소를 보장하지 않는다.

### 공급자 순서

1. fake provider
2. OpenAI E2E
3. Gemini
4. Anthropic

## 6. Delivery Roadmap

```text
M0 Foundation
  └─ M1 Secure AI Core
       └─ M2 OpenAI MVP
            └─ M3 Safe Apply
                 └─ M4 Multi-provider
                      └─ M5 Production Rollout
```

### M0 — Foundation and source-of-truth

상세: 기반 계획 `F0`, `F1`

주요 결과:

- tests가 version control과 `npm test`에 연결됨
- service-role module과 auth/error 경계 강화
- `004_page_assets_baseline.sql`
- `005_page_content_revision.sql`
- page별 save coordinator와 strict flush
- stale normal PATCH가 HTTP 409
- production legacy AGI disabled gate

Exit:

- fresh DB와 기존 DB에서 baseline/revision migration 성공
- 두 client의 stale PATCH가 조용히 덮어쓰지 못함
- local dirty data가 conflict 후에도 보존됨

### M1 — Secure AI Core

상세: 기반 계획 `F2`, 기능 계획 `I0`, `I1`, `I2`

주요 결과:

- `006_ai_document_editing.sql`
- credential/policy/generation/draft tables와 RLS/grants
- versioned AES-GCM과 redaction
- pure Markdown ↔ Tiptap conversion
- owner workspace policy API/UI
- fake provider generation → private draft
- idempotency/rate/concurrency protection

Exit:

- owner opt-in 전 generation 전부 차단
- cross-user/workspace/viewer/policy 우회 실패
- browser direct credential CRUD 실패
- fake provider flow에서 generation 중 page 불변

### M2 — OpenAI MVP

상세: 기능 계획 `I3`, `I4`

주요 결과:

- OpenAI credential test와 document transform adapter
- credential settings UI
- Original/AI tabs
- private draft 조회·편집·autosave·reload recovery
- provider errors와 request status UX

Exit:

- dirty original strict flush 후 최신 revision으로 generation
- generation만으로 page title/content/revision 불변
- Network/Runtime Logs에서 key와 document marker 0건
- desktop/mobile/keyboard 기본 동작 통과

### M3 — Safe Apply

상세: 기능 계획 `I5`

주요 결과:

- atomic replace-original RPC 연결
- stale draft 409 UX
- create-page parent validation
- image clone, attr remap, partial failure compensation
- apply idempotency와 client cache/revision sync

Exit:

- concurrent edit race에서 원본 손실 없음
- clone failure에서 orphan DB row/Storage object 없음
- 이미 applied request 재호출이 중복 page를 만들지 않음

### M4 — Multi-provider

상세: 기능 계획 `I6`

주요 결과:

- Gemini adapter
- Anthropic adapter
- common provider contract tests
- provider별 auth/output/usage/error/timeout/model allowlist

Exit:

- 세 provider가 같은 result/error contract를 통과
- provider별 live smoke test는 opt-in으로 분리
- workspace allowed provider 정책과 UI 일치

### M5 — Production Rollout

상세: 기반 계획 `F3`, 기능 계획 `I7`

주요 결과:

- Production/Preview Supabase와 encryption key 분리
- Vercel Sensitive Variables, Deployment Protection, WAF, Function limits
- logging/alert, retention/stale cleanup
- key rotation/provider incident/Vercel release runbooks
- feature flag rollout과 generation-only rollback

Exit:

- Vercel release checklist 승인
- Runtime/Log Drain secret scan 0건
- migration, authorization, tests/typecheck/build 통과
- 운영자가 rotation/incident/rollback을 runbook으로 수행 가능

## 7. Dependency Rules

- M0 완료 전 AI schema와 credential API를 production에 배포하지 않는다.
- M1 완료 전 실제 provider를 호출하지 않는다.
- OpenAI E2E가 통과하기 전 Gemini/Anthropic을 병렬 구현하지 않는다.
- atomic apply와 asset compensation이 통과하기 전 apply UI를 활성화하지 않는다.
- Production/Preview resource 분리와 Vercel checklist 전에는 feature flag를 켜지 않는다.
- 어떤 단계에서도 legacy AGI env/route를 신규 AI 구현에 재사용하지 않는다.

## 8. Risk Register

| 우선순위 | 위험 | 통제 | 검증 |
|---|---|---|---|
| P0 | API key 노출 | encryption, Sensitive env, redaction, no-store | Network/DB/log marker scan |
| P0 | stale 원본 덮어쓰기 | content revision, strict flush, atomic RPC | concurrent PATCH/apply tests |
| P0 | cross-user/workspace IDOR | server authorization + RLS/grants | user A/B, viewer, removed member tests |
| P0 | Preview가 production secret 사용 | environment isolation release gate | Vercel env/resource audit |
| P1 | duplicate provider 과금 | idempotency + user limits + WAF | duplicate/retry tests |
| P1 | image metadata/Storage 손실 | protected token + page-specific clone | round-trip/compensation tests |
| P1 | unsafe provider output | runtime schema, HTML/URL/image sanitization | malicious fixtures |
| P1 | Function hard timeout | internal timeout < maxDuration, stale recovery | forced timeout tests |
| P2 | Markdown layout attr 손실 | semantic preservation scope 명시 | complex fixture review |

## 9. Verification Gates

### Required commands

```bash
npm test
npm run test:unit
npm run test:api
npm run typecheck
npm run build
```

### Required security cases

- credential AES-GCM round-trip/tamper/wrong AAD/version/redaction
- direct credential query와 cross-user draft/generation access 실패
- viewer, removed member, disabled policy, disallowed provider/model 우회 실패
- stale normal save와 stale draft apply 409
- duplicate generation/apply idempotency
- malicious Markdown/raw HTML/unsafe URL/model image 차단
- asset clone compensation
- Vercel Runtime Logs key/document marker 0건

### Manual UI cases

- settings connect/test/replace/delete
- dirty original → strict flush → generation
- page 이동 후 request status/draft 복구
- original/draft save status 분리
- conflict 후 original과 draft 모두 보존
- mobile/desktop/keyboard/accessibility
- logout/workspace switch 후 credential input 제거

## 10. Rollout and Rollback

Rollout:

1. M0/M1을 `AI_FEATURE_ENABLED=false`로 배포한다.
2. fake provider와 DB authorization을 검증한다.
3. 내부 사용자와 한 workspace에 OpenAI를 활성화한다.
4. Safe Apply를 별도 flag로 활성화한다.
5. Gemini와 Anthropic을 순차 활성화한다.
6. 오류율, latency, duplicate, conflict, stale request를 보고 확대한다.

Rollback:

- generation만 차단하고 credential 삭제와 기존 draft 조회는 유지한다.
- apply 장애 시 apply만 끄고 draft 복구/export를 유지한다.
- migration은 drop하지 않고 forward-fix한다.
- encryption incident는 새 key 배포, old deployment 차단, credential 교체 순서로 대응한다.

## 11. Definition of Done

- migrations만으로 page_assets, revision, AI schema를 재현한다.
- 일반 save와 AI apply가 stale revision을 덮어쓰지 않는다.
- strict flush 실패 시 provider가 호출되지 않는다.
- workspace owner가 외부 AI 정책을 명시적으로 opt-in한다.
- 세 provider key를 안전하게 검증·저장·교체·삭제한다.
- title/body 계약과 protected image round-trip이 검증된다.
- private draft가 reload 후 복구되고 generation만으로 원본이 바뀌지 않는다.
- replace-original transaction과 create-page asset compensation이 통과한다.
- idempotency와 rate/concurrency controls가 중복 과금을 막는다.
- 세 provider가 common contract tests를 통과한다.
- Production/Preview resources가 분리되고 Vercel release checklist가 승인된다.
- authorization, parser safety, concurrency, tests, typecheck, build가 통과한다.
- rotation, retention, provider incident, rollout/rollback runbooks가 준비된다.
- 신규 AI와 legacy AGI가 분리되고 production AGI가 disabled다.
