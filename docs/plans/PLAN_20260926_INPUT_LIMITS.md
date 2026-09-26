# 사용자 입력 및 요청 크기 제한 계획

**작성일:** 2026-09-26  
**상태:** 검토 완료 · 구현 전  
**대상:** 페이지, 워크스페이스, 멤버 초대, 인증, 검색, 이미지 메타데이터 API 및 DB schema

## 결론

현재 이미지 파일에는 20MB 제한이 있지만, 페이지 제목·워크스페이스 이름·문서 JSON·검색어 등 대부분의 문자열과 JSON 요청에는 명시적인 크기 제한이 없다. UI의 `maxLength`만으로는 직접 API 요청을 막을 수 없으므로 다음 세 계층을 함께 적용한다.

1. 클라이언트는 입력 전에 제한을 안내하고 초과 입력을 방지한다.
2. API는 신뢰 경계에서 타입·글자 수·UTF-8 byte 크기·배열 개수를 검증한다.
3. 핵심 scalar 필드는 DB `CHECK` constraint로 우회 요청과 server-role 실수를 차단한다.

## 목표

- 과도한 요청으로 인한 메모리·DB·검색 성능 저하를 제한한다.
- 브라우저를 우회한 API 요청에도 동일한 제한을 적용한다.
- 제목이나 본문 저장 실패 시 사용자의 로컬 편집 내용을 잃지 않는다.
- 허용 경계값과 초과값을 자동 테스트로 고정한다.
- 기존 운영 데이터와 충돌하지 않는 순서로 DB constraint를 적용한다.

## 제외 범위

- 워크스페이스별 저장 용량 quota 및 과금 정책
- 페이지 개수·멤버 수·워크스페이스 수 제한
- API rate limit 구현
- 이미지 20MB 정책 변경
- 비밀번호 정책 변경 (Supabase Auth 설정을 별도로 따른다)
- 에디터 문서 구조 자체의 schema 재설계

## 권장 제한값

| 입력 | 제한 | 측정 기준 | 적용 계층 |
|---|---:|---|---|
| 워크스페이스 이름 | 80자 | Unicode code point 기준 | UI, API, DB |
| 페이지 제목 | 200자 | Unicode code point 기준 | UI, API, DB |
| 사용자 표시 이름 | 80자 | Unicode code point 기준 | UI, Auth metadata/profile DB |
| 초대 이메일 | 254자 | 문자열 길이 + 이메일 형식 | UI, API |
| 검색어 | 200자 | Unicode code point 기준 | UI, 검색 함수 |
| 이미지 alt/파일명 | 200자 | Unicode code point 기준 | 클라이언트 정규화, 문서 저장 검증 |
| 워크스페이스 정렬 ID | 200개 | 배열 원소 개수 | API |
| 페이지 content JSON | 2MiB | UTF-8 직렬화 byte | API, 필요 시 DB |
| 일반 JSON 요청 | 2.5MiB | raw request UTF-8 byte | API 공통 처리 |
| 이미지 파일 | 20MiB | 실제 Storage object byte | 기존 정책 유지 |

`string.length`는 UTF-16 code unit을 세므로 사용자에게 표시하는 글자 수에는 그대로 사용하지 않는다. 1차 구현에서는 `[...value].length`로 Unicode code point를 세고, DB에서는 `char_length()`를 사용한다. 이모지 조합을 한 글자로 보는 grapheme 단위가 반드시 필요해지면 `Intl.Segmenter` 도입을 별도로 검토한다.

## 현재 확인된 공백

### P0 — 요청 및 문서 본문

- `app/api/pages/route.ts`가 `request.json()`으로 전체 body를 먼저 메모리에 올린다.
- `PATCH /api/pages`는 object인 `content`를 크기나 문서 구조 검증 없이 저장한다.
- DB의 `pages.content`는 제한 없는 `JSONB`다.
- 플랫폼 기본 제한이 존재하더라도 로컬·preview·production에서 동일하다는 보장이 없고, 애플리케이션 오류 계약도 통제할 수 없다.

### P1 — 이름과 제목

- 페이지 생성·수정 title은 trim 및 기본값 처리만 수행한다.
- 워크스페이스 생성·수정 name도 trim 및 빈 값 처리만 수행한다.
- 관련 입력에 `maxLength`나 현재 글자 수 안내가 없다.
- DB 컬럼이 `TEXT`라 service-role 또는 향후 다른 API가 제한을 우회할 수 있다.

### P1 — 배열과 이메일

- workspace reorder의 `orderIds`는 중복과 membership만 확인하며 배열 최대 개수는 제한하지 않는다.
- 멤버 초대 email은 빈 문자열만 거르고 길이와 기본 형식을 확인하지 않는다.

### P2 — 로컬 검색과 메타데이터

- 페이지 검색은 모든 문서 평문을 순회하므로 긴 검색어를 받을 이유가 없다.
- 이미지 파일명이 alt로 들어갈 수 있어 비정상적으로 긴 파일명이 문서 JSON에 남을 수 있다.
- 회원가입 display name은 Supabase Auth metadata와 `profiles.display_name`에 제한 없이 저장된다.

---

## Phase 1 — 공통 제한 계약과 API 방어 (P0)

### 1.1 공통 상수 및 검증 유틸리티

**대상 파일**

- Create: `lib/input-limits.ts`
- Create: `app/api/_utils/request-body.ts`
- Create: `tests/input-limits.test.mjs`

**작업**

- [ ] 모든 제한값을 공통 상수로 정의해 UI와 API가 같은 값을 사용하게 한다.
- [ ] trim 이후 빈 값, 최대 글자 수, 배열 최대 개수를 검증하는 작은 함수를 만든다.
- [ ] `TextEncoder` 또는 `Buffer.byteLength(value, 'utf8')`로 UTF-8 byte를 측정한다.
- [ ] raw body를 제한 크기까지만 읽고 JSON을 parse하는 공통 함수를 만든다.
- [ ] `Content-Length`는 빠른 거절에만 사용하고, 누락·거짓 값에 대비해 실제 stream byte도 제한한다.
- [ ] 잘못된 JSON은 `400`, 요청 자체 초과는 `413`, 필드 제한 위반은 `422`로 통일한다.
- [ ] 오류 응답은 `field`, `code`, `max`를 포함하되 사용자 입력 원문은 반환·로그하지 않는다.

**완료 조건:** `request.json()` 직접 호출 없이 제한된 공통 parser를 통해 mutation body를 처리하고, Content-Length 우회 요청도 설정된 byte 이상 읽지 않는다.

### 1.2 페이지 제목과 content 제한

**대상 파일**

- Modify: `app/api/pages/route.ts`
- Modify: `lib/notion-lite/api.ts`
- Modify: `hooks/use-page-persistence.ts`
- Modify: `components/notion-lite/document-pane.tsx`
- Create or Modify: page API validation tests

**작업**

- [ ] POST/PATCH title을 trim한 뒤 200자 이하인지 검사한다.
- [ ] content가 plain object이며 지원하는 Tiptap root 형태인지 최소 검증한다.
- [ ] `JSON.stringify(content)`의 UTF-8 크기가 2MiB 이하인지 검사한다.
- [ ] title input에 공통 `maxLength`를 적용한다.
- [ ] 180자 이후에는 현재 글자 수와 최대값을 표시한다.
- [ ] autosave가 `413`/`422`를 받으면 dirty content를 제거하지 않고 저장 중단 상태와 원인을 표시한다.
- [ ] 동일한 초과 payload를 반복 자동 저장하지 않도록 재시도 조건을 둔다.

**완료 조건:** 200자 제목과 정확히 2MiB 이하 content는 저장되고, 경계 초과 요청은 DB write 전에 일관된 오류로 거부되며 로컬 편집 내용은 유지된다.

### 1.3 나머지 mutation API 제한

**대상 파일**

- Modify: `app/api/workspaces/route.ts`
- Modify: `app/api/workspaces/[id]/members/route.ts`
- Modify: `app/api/assets/route.ts`
- Modify: `app/api/assets/clone/route.ts`

**작업**

- [ ] workspace 생성·이름 변경에 80자 제한을 적용한다.
- [ ] `orderIds`를 최대 200개로 제한하고 각 원소가 UUID인지 검사한다.
- [ ] 초대 email을 254자 이하로 제한하고 기본 이메일 형식을 확인한다.
- [ ] role이 누락되거나 잘못됐을 때 암묵적으로 editor로 바꾸지 말고 `422`를 반환한다.
- [ ] asset prepare/complete/cancel/clone JSON도 공통 request-size parser를 사용한다.
- [ ] 기존 20MiB 파일 제한은 실제 Storage object 크기 확인을 최종 기준으로 유지한다.

**완료 조건:** 모든 mutation JSON route가 공통 요청 크기 제한을 사용하고, 큰 배열·이메일·이름이 DB 조회나 반복 update 전에 거부된다.

---

## Phase 2 — 클라이언트 입력 경험 (P1)

**대상 파일**

- Modify: `components/notion-lite/workspace-sidebar.tsx`
- Modify: `components/notion-lite/workspace-menu.tsx`
- Modify: `components/notion-lite/settings-panel.tsx`
- Modify: `components/notion-lite/document-pane.tsx`
- Modify: `components/search-modal.tsx`
- Modify: `components/auth-panel.tsx`
- Modify: `lib/notion-lite/api.ts`

**작업**

- [ ] workspace name, page title, display name, email, search input에 공통 제한값을 연결한다.
- [ ] 단순 HTML `maxLength`와 submit 직전 검증을 함께 적용한다.
- [ ] 붙여넣기·IME 입력에서도 초과 상태가 이해 가능하게 표시되는지 확인한다.
- [ ] 제한에 가까워졌을 때만 `현재/최대` 카운터를 노출해 평소 UI 밀도를 유지한다.
- [ ] API의 `413`/`422` 응답을 필드별 한국어 메시지로 매핑한다.
- [ ] 이미지 파일명은 basename을 정규화하고 alt에 넣기 전에 200자로 제한한다.
- [ ] 검색어는 200자에서 제한하고 검색 결과 계산 전에 trim한다.

**완료 조건:** 사용자는 제출 전에 제한을 알 수 있고, 모바일에서도 카운터와 오류 메시지가 입력 영역을 가리거나 가로 넘침을 만들지 않는다.

---

## Phase 3 — DB 불변조건 및 운영 적용 (P1)

**대상 파일**

- Create: `supabase/migrations/006_input_length_constraints.sql`
- Create: `docs/SUPABASE_MIGRATION_006_RUNBOOK.md`
- Modify: 관련 schema 검증 SQL/test

**사전 점검 SQL 대상**

- `char_length(workspaces.name) > 80`
- `char_length(pages.title) > 200`
- `char_length(profiles.display_name) > 80`
- `pg_column_size(pages.content)`의 최대값과 2MiB 초과 row

**작업**

- [ ] 운영 데이터의 최대 길이와 초과 row를 읽기 전용 SQL로 확인한다.
- [ ] 초과 데이터가 있으면 자동 절단하지 않고 별도 목록과 처리 기준을 정한다.
- [ ] scalar constraint를 `NOT VALID`로 추가하고 신규 write부터 차단한다.
- [ ] 기존 데이터 정리 후 `VALIDATE CONSTRAINT`를 실행한다.
- [ ] content JSON의 DB constraint는 실제 운영 크기와 write 비용을 측정한 뒤 적용 여부를 결정한다.
- [ ] migration은 재실행 가능하게 작성하고 forward-fix 절차를 runbook에 기록한다.

**예상 constraint**

```sql
CHECK (char_length(name) BETWEEN 1 AND 80)
CHECK (char_length(title) BETWEEN 1 AND 200)
CHECK (display_name IS NULL OR char_length(display_name) <= 80)
```

**완료 조건:** API를 거치지 않는 service-role write도 이름·제목 제한을 우회하지 못하며, 기존 운영 데이터 손실 없이 constraint validation이 완료된다.

---

## Phase 4 — 테스트 및 관측성

### 자동 테스트

- [ ] 각 문자열 필드의 `max - 1`, `max`, `max + 1` 테스트
- [ ] 한글, emoji, 결합문자 입력의 클라이언트/API/DB 계산 차이 확인
- [ ] content JSON의 byte 경계값과 다국어 payload 테스트
- [ ] `Content-Length` 누락, 거짓 값, chunked body의 초과 요청 테스트
- [ ] 비배열 `orderIds`, 중복 UUID, 201개 UUID 테스트
- [ ] 254자 이메일, 255자 이메일, 잘못된 형식 테스트
- [ ] 제한 초과 autosave 후 local dirty content 보존 테스트
- [ ] API 오류 응답에 원문 content/email이 포함되지 않는지 테스트
- [ ] 기존 20MiB 이미지 경계 및 실제 object metadata 검증 회귀 테스트

### 관측성

- [ ] 제한 거부는 raw payload 없이 route, field, code, byte/count만 기록한다.
- [ ] `413`/`422` 빈도를 route별로 집계해 제한값이 실제 사용을 과도하게 막는지 확인한다.
- [ ] 문서 크기 분포를 개인정보가 없는 bucket 단위로만 측정할지 검토한다.

### 기본 검증 명령

```sh
npm run typecheck
npm run test:image-assets
npm run test:editor-paste-priority
npm run test:page-parent-validation
npm run build
```

## 구현 순서

1. 공통 제한 상수와 순수 validation 테스트를 추가한다.
2. 공통 bounded JSON parser를 만들고 pages API부터 적용한다.
3. 페이지 제목과 content 저장 실패의 클라이언트 보존 동작을 완성한다.
4. workspaces, members, assets mutation route로 확장한다.
5. UI `maxLength`, 카운터, 오류 메시지를 연결한다.
6. 운영 데이터 사전 점검 후 migration 006을 작성·적용한다.
7. 경계값 integration test와 production build를 통과시킨다.

## 가장 위험한 적용 지점

문서 본문 제한을 autosave 단계에 추가할 때 서버가 초과 요청을 거부한 뒤 클라이언트가 해당 dirty content를 저장 완료로 오인하거나 제거하면 사용자 데이터가 유실될 수 있다. 따라서 request 제한 자체보다 먼저 저장 실패 시 `pendingContent` 보존과 반복 재시도 방지를 테스트해야 한다.

DB constraint 적용 시 기존에 제한을 초과한 제목이나 이름을 자동으로 잘라서는 안 된다. 사전 점검 결과를 확인하고, 신규 write 차단과 기존 데이터 검증을 분리해서 적용한다. Supabase migration은 소스 파일 생성만으로 운영 DB에 반영되지 않으므로 runbook에 Dashboard SQL 실행 및 사후 확인 절차를 명시한다.

## 배포 완료 기준

- [ ] 모든 mutation JSON API가 bounded parser를 사용한다.
- [ ] UI 제한을 우회한 요청도 API에서 동일하게 거부된다.
- [ ] 제목·워크스페이스명·표시 이름 constraint가 운영 DB에서 validated 상태다.
- [ ] content 제한 실패 시 로컬 문서가 유지되고 사용자에게 복구 가능한 안내가 표시된다.
- [ ] 경계값·Unicode·chunked body·대형 배열 자동 테스트가 통과한다.
- [ ] 제한 거부 로그에 사용자 원문이나 인증 정보가 남지 않는다.
- [ ] typecheck, 회귀 테스트, production build가 통과한다.
