# 회원가입·이메일 인증 UI 개선 계획

**작성일:** 2026-07-24  
**상태:** 계획 수립  
**대상:** `components/auth-panel.tsx`, Supabase 이메일 인증·재발송 흐름

## 진행 현황 (2026-07-24)

### Phase 0 로컬·공개 설정 확인

- Supabase browser client는 별도 auth option 없이 생성되며 설치된 auth-js 기본값인 `flowType: 'implicit'`, `detectSessionInUrl: true`를 사용
- 현재 인증 링크는 PKCE code exchange가 아니라 브라우저가 URL의 implicit callback을 자동 감지하는 계약
- 공개 Supabase Auth settings 확인 결과:
  - `disable_signup: false`: 이메일 회원가입 허용
  - `mailer_autoconfirm: false`: 이메일 확인 필수
- 로컬 `.env.local`의 `NEXT_PUBLIC_SITE_URL`: `https://cowork26dev.vercel.app`
- 연결된 Vercel 프로젝트의 `NEXT_PUBLIC_SITE_URL`은 Preview와 Production 양쪽에 등록되어 있음
- 현재 구현에는 별도 `/auth/confirm` route가 없으며, root redirect 후 Supabase client 초기화가 session을 감지하는 구조

### 외부 설정에서 추가 확인할 항목

- Vercel Preview·Production의 `NEXT_PUBLIC_SITE_URL` 실제 값
- Supabase Authentication URL Configuration의 Site URL과 Redirect URLs
- Supabase 프로젝트의 실제 비밀번호 최소 길이·문자 정책
- 실제 인증 메일 링크 클릭 후 session 생성과 앱 진입 결과

외부 확인 전까지는 기존 implicit flow와 redirect 구조를 변경하지 않는다. Phase 1의 `verify-email` 화면 상태 분리는 이 계약을 유지한 채 진행할 수 있으며, 비밀번호 조건 UI와 callback route 여부는 확인 후 결정한다.

## 목표

회원가입 성공 후 로그인 폼으로 되돌아가는 현재 흐름을 별도의 이메일 인증 대기 화면으로 분리한다. 입력 폼의 정보 계층, 검증, 오류 안내와 접근성을 정돈해 사용자가 현재 단계와 다음 행동을 명확하게 이해할 수 있는 프로덕션 수준의 인증 경험을 만든다.

## 현재 상태

- 인증 화면은 `login`과 `signup` 두 상태만 사용한다.
- 회원가입 성공 후 로그인 모드로 돌아가 초록색 안내문을 표시한다.
- 미인증 계정으로 로그인하면 오류 영역 안에 인증 메일 재발송 버튼을 표시한다.
- 이름, 이메일, 비밀번호 입력은 placeholder만 사용하고 label과 autocomplete가 없다.
- 비밀번호 조건과 표시·숨김 기능이 없다.
- Supabase 오류 원문이 그대로 노출될 수 있다.
- 재발송 쿨다운과 이메일 변경 경로가 없다.
- 인증 리다이렉트는 `NEXT_PUBLIC_SITE_URL`을 사용하며, 값이 없으면 dev Vercel 주소로 fallback한다.

## 핵심 원칙

- 기존 Cowork26 색상, 테두리, 그림자 스타일은 유지한다.
- 프로덕션다운 인상은 과도한 장식보다 정보 계층과 상태 전환을 명확히 해 만든다.
- 가입 완료와 이메일 인증 완료를 서로 다른 단계로 표현한다.
- 사용자 안내는 한국어로 통일하고 Supabase 원문 오류는 사용자용 문구로 변환한다.
- 비밀번호는 회원가입 요청 성공 직후 메모리에서 제거한다.
- 재발송은 중복 요청과 rate limit을 고려해 쿨다운을 적용한다.
- 인증 URL이나 세션 처리 방식은 현재 Supabase 설정을 확인한 뒤 변경한다.

## 제외 범위

- 소셜 로그인
- 비밀번호 찾기·재설정
- CAPTCHA
- 다중 인증
- Supabase Auth 교체
- 사용자·워크스페이스 DB 스키마 변경
- 인증 화면 전체 브랜드 리디자인

## 성공 조건

- 회원가입 성공 후 로그인 입력 폼이 아니라 이메일 인증 대기 화면이 나타난다.
- 발송한 이메일 주소와 다음 행동이 명확하게 표시된다.
- 미인증 로그인도 동일한 인증 대기 화면으로 연결된다.
- 인증 메일 재발송에 로딩, 성공·실패, 쿨다운 상태가 있다.
- 이름, 이메일, 비밀번호에 label과 올바른 autocomplete가 적용된다.
- 비밀번호 조건과 표시·숨김 기능이 제공된다.
- 오류와 성공 상태가 스크린 리더에 전달된다.
- 320px 폭과 낮은 viewport에서도 카드가 잘리거나 가로로 넘치지 않는다.
- 개발·Preview·Production의 인증 리다이렉트 URL이 의도한 도메인으로 연결된다.

---

## 목표 사용자 흐름

### 회원가입

```text
회원가입 폼
  → Supabase signUp 성공
  → 비밀번호 제거
  → verify-email 화면
  → 이메일 링크 클릭
  → 세션 확정
  → Cowork26 앱
```

### 미인증 로그인

```text
로그인 시 Email not confirmed
  → verify-email 화면
  → 인증 메일 재발송 가능
  → 이메일 링크 클릭
  → Cowork26 앱
```

### 인증 대기 화면

```text
COWORK26

       [메일 아이콘]

이메일을 확인해주세요

인증 링크를 아래 주소로 보냈습니다.
user@example.com

메일의 링크를 열면 가입이 완료됩니다.

[ 인증 메일 다시 보내기 ]
45초 후 다시 보낼 수 있습니다.

이메일 주소 변경
로그인으로 돌아가기
```

---

## Phase 0 — 기준선과 Supabase 인증 계약 확인

### 대상 파일

- Read: `components/auth-panel.tsx`
- Read: `lib/supabase-browser.ts`
- Read: `.env.example`
- Read: `README.md`
- Inspect: Supabase Authentication URL Configuration
- Inspect: Vercel Development, Preview, Production 환경변수

### 작업

- [x] 로그인, 회원가입, 가입 성공, 미인증 로그인, 재발송 상태의 현재 구현을 기록한다.
- [x] Supabase Email Confirmations 활성화 상태를 확인한다.
- [x] client와 signUp 요청이 implicit, PKCE 중 어떤 방식을 사용하는지 확인한다.
- [ ] 인증 링크 클릭 후 현재 브라우저 client가 세션을 정상 감지하는지 확인한다.
- [x] 로컬 `NEXT_PUBLIC_SITE_URL`과 Vercel Preview·Production의 환경변수 등록 여부를 확인한다.
- [ ] Vercel Preview·Production의 `NEXT_PUBLIC_SITE_URL` 실제 값을 확인한다.
- [ ] Supabase Redirect URLs에 필요한 도메인이 등록되어 있는지 확인한다.
- [ ] 현재 Supabase 비밀번호 최소 조건을 확인해 UI 안내와 일치시킨다.

### 가장 위험한 지점

인증 링크 형식을 확인하지 않고 callback route를 추가하면 정상 동작 중인 세션 감지를 깨뜨릴 수 있다. UI를 먼저 개선하고 리다이렉트 처리는 실제 링크 방식과 환경 설정을 확인한 뒤 변경한다.

### 완료 조건

- 현재 인증 링크와 세션 생성 방식이 문서화된다.
- UI에 표시할 비밀번호 조건과 리다이렉트 URL 계약이 확정된다.

---

## Phase 1 — 인증 상태 모델과 화면 전환 분리

### 대상 파일

- Modify: `components/auth-panel.tsx`
- Optional Create: `components/auth/email-verification-panel.tsx`
- Optional Create: `lib/auth-feedback.ts`

### 상태 모델

```ts
type AuthMode = 'login' | 'signup' | 'verify-email'

interface AuthFeedback {
  type: 'success' | 'error'
  message: string
}
```

### 작업

- [ ] `verify-email` 상태와 인증 대상 이메일 상태를 추가한다.
- [ ] 회원가입 성공 시 로그인 모드로 돌아가지 않고 `verify-email`로 전환한다.
- [ ] 미인증 로그인 오류도 `verify-email`로 전환한다.
- [ ] 회원가입 성공 직후 password state를 비운다.
- [ ] 모드 전환 시 이전 오류, 성공 메시지와 재발송 상태를 예측 가능하게 초기화한다.
- [ ] 이메일 주소 변경을 누르면 이메일 값을 유지한 채 signup 폼으로 돌아간다.
- [ ] 로그인으로 돌아가기를 누르면 이메일은 유지하고 비밀번호만 비운다.
- [ ] 화면 분리 후 `auth-panel.tsx`가 과도하게 길어지면 인증 대기 UI만 별도 컴포넌트로 추출한다.

### 검증

- 회원가입 성공 후 비밀번호 입력이 다시 보이지 않는다.
- 미인증 로그인과 신규 가입이 동일한 인증 대기 화면을 사용한다.
- 모드를 반복 전환해도 이전 오류가 남지 않는다.

### 완료 조건

- 가입 폼, 로그인 폼, 인증 대기 화면의 책임과 전환 조건이 명확히 분리된다.

---

## Phase 2 — 로그인·회원가입 폼 시각 구조 개선

### 대상 파일

- Modify: `components/auth-panel.tsx`
- Optional Create: `components/auth/password-field.tsx`

### 작업

- [ ] 로그인과 회원가입에 각각 명확한 제목과 한 줄 설명을 제공한다.
- [ ] 모든 입력에 화면에 보이는 label을 추가한다.
- [ ] 입력에 `name`과 autocomplete를 적용한다.

| 필드 | autocomplete |
|---|---|
| 이름 | `name` |
| 이메일 | `email` |
| 로그인 비밀번호 | `current-password` |
| 회원가입 비밀번호 | `new-password` |

- [ ] 비밀번호 표시·숨김 버튼을 입력 내부 또는 우측에 배치한다.
- [ ] 회원가입 비밀번호 아래에 실제 정책과 일치하는 짧은 조건을 표시한다.
- [ ] 입력 focus, 오류, disabled 상태를 색상 외에도 테두리와 문구로 구분한다.
- [ ] 요청 중 입력과 모드 전환을 잠가 중복 상태 변경을 방지한다.
- [ ] 카드 폭, 세로 padding과 문구 간격을 좁은 화면에서도 안정적으로 조정한다.
- [ ] 기존 초록색 primary button과 검은 그림자 스타일은 유지한다.

### 권장 문구

#### 로그인

- 제목: `다시 오신 것을 환영합니다`
- 설명: `계정에 로그인해 협업을 계속하세요.`
- 버튼: `로그인`

#### 회원가입

- 제목: `계정 만들기`
- 설명: `팀과 함께 문서를 만들고 정리해보세요.`
- 버튼: `회원가입`

### 완료 조건

- placeholder가 없어도 각 입력의 목적을 알 수 있다.
- 키보드 focus와 오류 필드를 명확하게 식별할 수 있다.
- 로그인과 회원가입의 목적이 제목만 봐도 구분된다.

---

## Phase 3 — 이메일 인증 대기·재발송 UI 구현

### 대상 파일

- Modify: `components/auth-panel.tsx`
- Optional Create: `components/auth/email-verification-panel.tsx`

### 작업

- [ ] 메일 아이콘, 제목, 설명, 대상 이메일을 명확한 계층으로 표시한다.
- [ ] 긴 이메일 주소는 줄바꿈 또는 안전한 truncate와 title로 처리한다.
- [ ] 인증 메일 재발송 버튼을 primary action으로 제공한다.
- [ ] 재발송 성공 시 같은 화면에서 `인증 메일을 다시 보냈습니다.`를 표시한다.
- [ ] 마지막 발송 시각을 기준으로 60초 쿨다운을 적용한다.
- [ ] 쿨다운 중 버튼을 비활성화하고 남은 시간을 표시한다.
- [ ] 재발송 요청은 `try/finally`로 loading 상태를 항상 복구한다.
- [ ] 이메일 주소 변경과 로그인 복귀는 secondary text action으로 제공한다.
- [ ] 인증 대기 화면에서는 password state를 사용하거나 표시하지 않는다.

### 접근성

- [ ] 인증 대기 화면에 의미 있는 heading을 사용한다.
- [ ] 재발송 결과는 `role="status"` 또는 `aria-live="polite"`로 알린다.
- [ ] 실패 메시지는 `role="alert"`로 알린다.
- [ ] 로딩·쿨다운 버튼에 정확한 accessible name을 제공한다.
- [ ] 모드 전환 후 새 화면 heading 또는 첫 입력으로 focus를 이동한다.

### 완료 조건

- 사용자가 메일을 확인해야 한다는 것과 재발송 가능 시점을 바로 이해할 수 있다.
- 재발송 성공·실패가 인증 대기 화면 안에서 처리된다.

---

## Phase 4 — 오류 문구와 인증 리다이렉트 안정화

### 대상 파일

- Modify: `components/auth-panel.tsx`
- Optional Create: `lib/auth-feedback.ts`
- Optional Create: `app/auth/confirm/page.tsx`
- Modify: `.env.example`
- Modify: `README.md`

### 작업

- [ ] Supabase 오류를 사용자용 한국어 문구로 매핑한다.

| 오류 유형 | 사용자 안내 |
|---|---|
| 잘못된 로그인 정보 | `이메일 또는 비밀번호를 확인해주세요.` |
| 이메일 미인증 | 인증 대기 화면으로 이동 |
| 이미 가입된 이메일 | 로그인 또는 이메일 확인 안내 |
| rate limit | 잠시 후 다시 시도하도록 안내 |
| 네트워크 오류 | 연결 확인 후 재시도 안내 |
| 기타 | 일반적인 실패 안내와 재시도 제공 |

- [ ] 개발 Vercel 주소로 조용히 fallback하는 현재 정책을 유지할지 결정한다.
- [ ] 운영에서는 `NEXT_PUBLIC_SITE_URL` 누락을 배포 설정 오류로 명확히 감지한다.
- [ ] Preview 배포의 인증 링크 정책을 고정 도메인 또는 허용된 Preview 도메인 중 하나로 확정한다.
- [ ] 인증 링크 만료·실패 상태를 구분할 필요가 있으면 전용 confirm 화면을 추가한다.
- [ ] confirm 화면을 추가하는 경우 성공, 만료, 잘못된 링크, 재발송 경로를 제공한다.
- [ ] README와 `.env.example`에 확정된 환경별 설정을 반영한다.

### 보안·개인정보 기준

- [ ] 오류 문구로 계정 존재 여부를 불필요하게 노출하지 않는다.
- [ ] 인증 token, session, 전체 auth 응답을 로그에 남기지 않는다.
- [ ] 사용자 이메일은 인증 화면에서 필요한 범위에서만 표시한다.
- [ ] redirect URL은 허용된 origin/path만 사용한다.

### 완료 조건

- 사용자는 내부 Supabase 오류 문구를 보지 않는다.
- 각 배포 환경의 인증 링크 목적지가 예측 가능하다.

---

## Phase 5 — 검증과 문서화

### 자동 검증

```sh
npm run typecheck
npm run build
git diff --check
```

정식 테스트 기반이 준비되어 있다면 다음 상태 전환을 단위 테스트로 추가한다.

- signup 성공 → `verify-email`
- login의 email-not-confirmed → `verify-email`
- mode 전환 시 feedback 초기화
- resend loading 복구
- resend cooldown 시작·만료
- Supabase 오류 문구 매핑

### 수동 검증

- [ ] 정상 로그인
- [ ] 잘못된 이메일·비밀번호 로그인
- [ ] 신규 회원가입 성공
- [ ] 이미 가입된 이메일로 회원가입
- [ ] 미인증 계정 로그인
- [ ] 인증 메일 재발송 성공·실패·쿨다운
- [ ] 이메일 주소 변경 후 재가입
- [ ] 인증 링크 클릭 후 정상 세션 생성
- [ ] 만료되거나 잘못된 인증 링크
- [ ] 모바일 320px 폭과 낮은 viewport
- [ ] 키보드만으로 입력, 제출, 재발송, 모드 전환
- [ ] 스크린 리더의 heading, label, success, error 알림
- [ ] Development, Vercel Preview, Production redirect

### 문서화

- [ ] 구현 결과를 해당 날짜의 `docs/history/DEV_YYMMDD.md`에 기록한다.
- [ ] 화면 상태와 환경변수 정책이 바뀌면 README를 갱신한다.
- [ ] 수동 검증 결과와 남은 제약을 history에 기록한다.

## 단계별 검증 게이트

각 Phase를 완료할 때마다 다음을 확인한다.

```sh
npm run typecheck
git diff --check
```

화면 구조 또는 인증 URL을 변경한 Phase에서는 production build와 해당 인증 흐름 수동 확인까지 완료한 후 다음 단계로 이동한다.

## 권장 실행 순서

1. Phase 0에서 Supabase 링크 방식과 비밀번호 정책을 확인한다.
2. Phase 1에서 `verify-email` 상태만 먼저 추가하고 회원가입·미인증 로그인을 확인한다.
3. Phase 2에서 로그인·회원가입 폼을 시각적으로 정돈한다.
4. Phase 3에서 인증 대기 화면과 재발송 쿨다운을 완성한다.
5. Phase 4의 오류 매핑과 환경별 리다이렉트를 별도 점검한다.
6. Phase 5의 전체 수동 검증 후 history를 작성한다.

첫 구현 작업은 **Phase 0 기준선 확인 후 Phase 1의 `verify-email` 상태 분리**로 시작한다.
