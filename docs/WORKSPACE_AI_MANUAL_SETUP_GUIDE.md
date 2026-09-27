# 워크스페이스 AI 수동 설정 가이드

**작성일:** 2026-09-28
**대상:** Supabase와 Vercel을 직접 관리하는 운영자
**관련 계획:** `PLAN_20260926_WORKSPACE_AI_ANALYSIS_IMPLEMENTATION.md`

이 문서는 워크스페이스 AI(BYOK) 구현 과정에서 코드만으로 완료할 수 없는 수동 작업을 분리한다. SQL Editor 실행과 Vercel 설정 변경은 운영자가 직접 수행하며, 각 migration 또는 기능 구현이 완료되기 전에는 선행 실행하지 않는다.

## 1. 현재 해야 할 일

현재 브랜치는 migration `006`~`008`, AI 암호화 기반, credential API/UI, workspace AI opt-in 정책, 분석 source 선택·서버 정규화, 분석 API/결과 UI와 OpenAI/Gemini provider adapter까지 구현된 상태다. OpenAI는 `gpt-5.6-luna`, Gemini는 `gemini-3.6-flash`로 서버에서 고정하며 provider 간 자동 fallback은 하지 않는다. 로컬에서는 OpenAI 개인 키 등록과 다중 페이지 분석까지 확인했다. Vercel의 Preview/Production 변수는 아직 각 환경에 별도로 설정해야 한다.

- migration `006`~`008`을 이미 적용하고 각 runbook 검증 결과가 정상이라면 다시 실행하지 않는다.
- Vercel에 아래 서버 전용 AI 변수를 Preview와 Production별로 등록한다. Production은 검증 승인 전 flag를 모두 `false`로 유지한다.
- 사용자 provider key는 앱 설정 화면에서 본인 계정에 연결하며 repository나 Vercel 공용 환경변수에 저장하지 않는다.
- 로컬 자동 테스트는 실제 provider key 없이 deterministic response fixture를 사용한다.
- live smoke는 `RUN_LIVE_AI_SMOKE=true`를 명시한 별도 명령에서만 수행하며 key와 응답 본문을 출력하지 않는다.

| 시점 | 운영자가 할 일 | 현재 상태 |
|---|---|---|
| Task 2 완료 후 | Supabase에 `006_page_assets_baseline.sql` 적용 | 적용·검증 완료 |
| Task 3 완료 후 | Supabase에 `007_page_content_revision.sql` 적용 | 적용·검증 완료 |
| Task 5 완료 후 | Supabase에 `008_ai_document_editing.sql` 적용 | 적용·검증 완료 |
| Preview 배포 전 | Preview 전용 Vercel secret과 feature flag 설정 | 사용자 수동 설정 필요 |
| Production 승인 전 | Production 전용 secret 설정, flag는 `false` 유지 | 사용자 수동 설정 필요 |
| 내부 검증 통과 후 | 승인된 범위에서 Production flag 활성화 | release checklist 통과 후 진행 |

## 2. Supabase에서 직접 실행할 항목

### 2.1 적용 원칙

각 migration은 반드시 다음 조건이 모두 충족된 후 적용한다.

1. 저장소에 해당 SQL 파일과 같은 번호의 runbook이 존재한다.
2. `git diff --check`, test, typecheck, build가 통과한다.
3. 먼저 로컬 Supabase 또는 별도 Preview/Test 프로젝트에서 검증한다.
4. 운영 DB backup과 schema snapshot을 확보한다.
5. Production에는 `006` → `007` → `008` 순서로 한 파일씩 적용한다.

SQL Editor를 사용할 때 파일 일부를 복사하지 말고 migration 파일 전체를 한 번만 실행한다. 오류가 발생하면 임의로 다음 migration을 계속 실행하지 말고 결과 전문과 적용된 객체를 먼저 확인한다.

### 2.2 실행 예정 파일

```text
supabase/migrations/006_page_assets_baseline.sql
supabase/migrations/007_page_content_revision.sql
supabase/migrations/008_ai_document_editing.sql
```

각 파일이 구현되면 아래 runbook을 함께 제공한다.

```text
docs/SUPABASE_MIGRATION_006_RUNBOOK.md
docs/SUPABASE_MIGRATION_007_RUNBOOK.md
docs/SUPABASE_MIGRATION_008_RUNBOOK.md
```

runbook에는 적용 전 drift 확인 query, 실행 SQL, 적용 후 검증 query, 예상 결과, 실패 시 중단 기준을 포함한다. 실제 SQL과 table 이름이 확정되기 전에는 이 문서에 추정 query를 넣지 않는다.

### 2.3 환경별 적용 순서

1. 로컬 또는 격리된 Test Supabase
2. Preview Supabase
3. Production Supabase

Preview와 Production은 가능하면 서로 다른 Supabase project를 사용한다. 동일 project를 사용하면 Preview 코드가 Production 데이터와 credential ciphertext에 접근할 위험이 있으므로 AI 기능을 활성화하지 않는다.

### 2.4 적용 후 필수 확인

- AI credential 관련 table에 RLS가 활성화되어 있다.
- `PUBLIC`, `anon`, `authenticated`의 직접 `INSERT`, `UPDATE`, `DELETE` 권한이 없다.
- 브라우저 publishable key로 credential row를 조회하거나 변경할 수 없다.
- service-role API도 요청 사용자와 credential의 `user_id`가 같은지 서버에서 검사한다.
- 저장된 provider key는 평문이 아니라 ciphertext, IV/nonce, auth tag, key version 형태다.
- migration history에 `006`, `007`, `008`이 순서대로 기록된다.

주의: service role은 RLS를 우회한다. 따라서 RLS 적용 여부만으로 API 권한 검증이 끝난 것이 아니다.

## 3. Vercel에서 직접 설정할 항목

### 3.1 Vercel에 등록할 환경변수

Vercel Project Settings → Environment Variables에서 각 변수를 해당 환경에 개별 등록한다. `Preview` 값은 Preview deployment에, `Production` 값은 Production deployment에 적용한다. `AI_CREDENTIAL_ENCRYPTION_KEY_V1`은 서버 전용 secret으로 취급하고 `NEXT_PUBLIC_` 접두어를 붙이지 않는다.

| 변수 | Preview | Production | 비고 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview Supabase URL | Production Supabase URL | 브라우저 공개, 각 배포의 Supabase와 일치 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview publishable key | Production publishable key | 브라우저 공개 |
| `NEXT_PUBLIC_SITE_URL` | Preview 접속 origin | Production 접속 origin | Supabase Auth redirect 설정과 일치 |
| `SUPABASE_URL` | Preview Supabase URL | Production Supabase URL | 서버 전용 |
| `SUPABASE_SERVICE_KEY` | Preview 전용 secret | Production 전용 secret | Sensitive, `NEXT_PUBLIC_` 금지 |
| `AI_CREDENTIAL_ENCRYPTION_KEY_V1` | Preview 전용 key | Production 전용 key | 32-byte Base64 key, 환경 간 재사용 금지 |
| `AI_FEATURE_ENABLED` | 내부 검증 시 `true` | 최초 `false` | 전체 AI kill switch |
| `AI_OPENAI_ENABLED` | OpenAI 검증 시 `true` | 최초 `false` | OpenAI 호출 switch |
| `AI_GEMINI_ENABLED` | Gemini 검증 시 `true`, 아니면 `false` | 최초 `false` | Gemini 호출 switch |
| `AI_WORKSPACE_ANALYSIS_ENABLED` | 내부 검증 시 `true` | 최초 `false` | 분석 기능 switch |

브라우저에 필요한 기존 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`은 환경별 project/origin과 일치시킨다. 어떤 credential 또는 master key에도 `NEXT_PUBLIC_` 접두어를 붙이지 않는다.

#### 개인 OpenAI/Gemini API key는 Vercel에 등록하지 않는다

위 `AI_CREDENTIAL_ENCRYPTION_KEY_V1`은 사용자가 앱에서 등록하는 provider key를 암호화하기 위한 서버 master key다. OpenAI/Gemini provider key 그 자체가 아니다. 각 사용자는 로그인한 뒤 `설정 → AI 연결`에서 본인 provider key를 연결하며, API가 provider 검증 후 암호화해 `user_ai_credentials`에 저장한다. 따라서 다음 변수는 Vercel에 만들지 않는다.

```text
OPENAI_API_KEY
GEMINI_API_KEY
```

#### Preview 내부 OpenAI 검증 권장값

OpenAI 분석만 먼저 확인할 때 Preview 환경에 아래처럼 설정한다. Gemini는 아직 시험하지 않으면 `false`로 둔다.

```env
AI_FEATURE_ENABLED=true
AI_OPENAI_ENABLED=true
AI_GEMINI_ENABLED=false
AI_WORKSPACE_ANALYSIS_ENABLED=true
```

Production은 release 승인 전 아래 네 flag를 모두 `false`로 둔다.

```env
AI_FEATURE_ENABLED=false
AI_OPENAI_ENABLED=false
AI_GEMINI_ENABLED=false
AI_WORKSPACE_ANALYSIS_ENABLED=false
```

### 3.2 encryption key 생성 규칙

계약은 **32-byte random key를 Base64로 인코딩한 값**이다. Preview와 Production용 값을 각각 별도로 생성한다.

```sh
openssl rand -base64 32
```

- 생성된 값을 채팅, 이슈, 문서, commit에 붙여 넣지 않는다.
- Preview와 Production에 서로 다른 값을 사용한다.
- 로컬 개발 key도 Production key를 복사하지 않는다.
- Vercel의 서버 환경 변수로 저장하고 값을 출력하거나 문서화하지 않는다.
- key를 잃으면 기존 ciphertext를 복호화할 수 없으므로 rotation runbook과 복구 책임자를 정한다.

### 3.3 권장 최초 설정값

Production 배포 시에는 schema와 비활성 코드를 먼저 올린다. AI 분석 검증과 운영 승인이 끝나기 전에는 다음 값을 유지한다.

```env
AI_FEATURE_ENABLED=false
AI_OPENAI_ENABLED=false
AI_GEMINI_ENABLED=false
AI_WORKSPACE_ANALYSIS_ENABLED=false
```

환경변수를 변경하면 기존 deployment가 자동으로 새 값을 사용하지 않으므로 새 deployment를 만든다. 이전 deployment가 기존 secret으로 계속 실행될 수 있는지도 확인하고, 필요하면 접근을 차단한다.

Vercel 변수 적용 절차:

1. Vercel 프로젝트의 Environment Variables에서 `Preview` 또는 `Production` 대상 환경을 선택한다.
2. 위 표의 변수와 값만 해당 환경에 등록한다. encryption key는 환경마다 새로 생성한다.
3. Supabase URL/service key와 브라우저 공개 Supabase 설정이 같은 환경의 Supabase 프로젝트를 가리키는지 확인한다.
4. 저장 후 해당 환경의 새 deployment를 생성한다. 기존 deployment는 변경한 값을 자동으로 받지 않는다.
5. Preview에서는 앱의 AI 연결 상태 확인 후 owner가 workspace AI 정책에서 OpenAI와 분석을 명시적으로 허용한다.
6. Production은 release checklist 승인 전 flag를 모두 `false`로 유지한다.

### 3.4 Preview 활성화 순서

1. Preview 전용 Supabase에 `006`~`008`을 순서대로 적용한다.
2. Preview 전용 `SUPABASE_*`와 `AI_CREDENTIAL_ENCRYPTION_KEY_V1`을 등록하고 OpenAI 검증 flag를 설정한다.
3. 자동 테스트 fixture로 권한·암호화·로그 노출 검증을 한다.
4. 테스트용 개인 OpenAI key를 앱 설정에 등록하고 owner가 workspace policy에서 OpenAI 분석을 허용한 뒤 내부 workspace에서 검증한다.
5. OpenAI 검증과 로그 점검이 끝난 뒤 필요하면 Gemini flag를 켜고 테스트용 Gemini key를 앱 설정에 등록해 별도로 검증한다.
6. Runtime Logs와 Log Drain에서 API key marker와 문서 marker가 0건인지 확인한다.

개인 key 연결 후 Preview 앱의 분석을 사용하면 별도 provider key 주입은 필요 없다. 아래 opt-in smoke는 앱 연결 전 로컬에서 credential/model 접근만 확인하려는 경우에만 사용한다. 여기에 적는 개인 key는 Vercel에 등록하지 않으며, 로컬 실행 환경에만 일시 주입한다.

```sh
RUN_LIVE_AI_SMOKE=true AI_SMOKE_PROVIDER=openai OPENAI_API_KEY='...' npm run smoke:ai-provider
RUN_LIVE_AI_SMOKE=true AI_SMOKE_PROVIDER=gemini GEMINI_API_KEY='...' npm run smoke:ai-provider
```

`RUN_LIVE_AI_SMOKE=true`가 없으면 스크립트는 외부 요청을 거부한다. 이 smoke는 문서 내용을 전송하지 않으며 실제 분석은 앱의 내부 테스트 workspace에서 별도로 확인한다.

7. owner opt-in, owner/editor 허용, viewer/비멤버 거부를 확인한다.
8. 실패 시 네 AI flag를 모두 `false`로 되돌리고 새 deployment를 만든다.

### 3.5 Production 활성화 전 확인

- Preview와 Production의 Supabase project, service key, encryption key가 다르다.
- Preview Deployment Protection이 켜져 있다.
- AI endpoint에 rate/concurrency 제한과 필요한 Firewall rule이 적용되어 있다.
- Vercel project/team/CI 및 Runtime Log 접근자가 최소화되어 있다.
- secret scan, 권한 우회 test, 최대 입력 크기 test가 통과한다.
- credential 삭제는 AI 실행 flag를 꺼도 계속 사용할 수 있다.
- 내부 workspace 한 곳부터 활성화할 수 있는 정책이 준비되어 있다.

## 4. 작업 완료 시 제공할 안내 형식

각 수동 작업이 필요한 시점에는 다음 형식으로 별도 안내한다.

```text
[사용자 수동 작업 필요]
환경: Preview 또는 Production
대상: Supabase SQL Editor 또는 Vercel
파일/변수: 정확한 이름
실행 순서: 번호 목록
예상 결과: 검증 query 또는 화면 상태
중단 조건: 오류 또는 예상과 다른 결과
다음 단계: 결과를 확인한 뒤 진행할 코드 작업
```

SQL 파일을 만들었다는 이유만으로 자동 적용된 것으로 간주하지 않는다. 사용자가 적용 완료를 알려주기 전에는 해당 환경의 migration을 미적용 상태로 취급한다.

## 5. 하지 말아야 할 것

- provider API key를 Supabase Auth user metadata나 브라우저 local/session storage에 저장하지 않는다.
- 개인 provider key를 Vercel 환경변수에 사용자별로 저장하지 않는다.
- master encryption key를 Supabase table, SQL function, migration 또는 repository에 저장하지 않는다.
- Production DB를 자동 test 대상으로 사용하지 않는다.
- SQL 적용 실패 후 일부 객체만 수동 수정한 채 다음 migration으로 넘어가지 않는다.
- Production feature flag 세 개를 한 번에 `true`로 켜지 않는다.
