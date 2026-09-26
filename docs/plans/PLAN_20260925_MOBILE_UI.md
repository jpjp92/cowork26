# 모바일 UI 개선 계획

**작성일:** 2026-09-25  
**상태:** 1차 구현 완료 · 동적 모바일 검증 및 후속 기능 남음  
**대상:** 인증 화면, 앱 헤더, 워크스페이스 탐색, 페이지 트리, 문서 편집기, 설정 패널

## 결론

모바일 전용 페이지나 별도 컴포넌트 트리를 만들지 않는다. 인증·권한·워크스페이스·페이지·편집기 로직은 공통으로 유지하고, `md` 미만 화면에서 탐색 방식과 터치 상호작용만 전환한다.

가장 먼저 해결할 항목은 다음 세 가지다.

1. 문서 위에 쌓이는 사이드바를 모바일 드로어로 전환한다.
2. hover 및 HTML drag-and-drop 의존 기능에 터치 대체 수단을 제공한다.
3. 모바일 브라우저 viewport, 키보드, safe area와 작은 화면의 가로 넘침을 처리한다.

## 목표

- 320px 이상 화면에서 가로 스크롤 없이 핵심 기능을 사용할 수 있다.
- 모바일에서는 문서가 기본 화면을 차지하고 페이지 목록은 필요할 때만 연다.
- 페이지 생성·선택·이동·삭제·다운로드를 터치만으로 수행할 수 있다.
- 화면 키보드가 열린 상태에서도 제목과 본문을 편집하고 저장 상태를 확인할 수 있다.
- 데스크톱의 현재 사이드바 및 드래그 동작에는 회귀가 없다.
- 주요 터치 대상과 오버레이가 기본 접근성 요구사항을 만족한다.

## 제외 범위

- `/mobile` 같은 별도 라우트 또는 모바일 전용 앱 구축
- 디자인 시스템 전면 교체
- 에디터 프레임워크 교체
- 네이티브 앱 및 오프라인 모드
- 이번 작업과 무관한 데스크톱 UI 재설계

## 현재 확인된 문제

| 우선순위 | 영역 | 현재 상태 | 영향 |
|---|---|---|---|
| P0 | 전체 레이아웃 | `h-screen`과 `max-md:flex-col`을 사용 | 주소창·키보드 높이에 취약하고 사이드바가 문서 공간을 차지함 |
| P0 | 문서 카드 | 모바일에서 `w-full`과 `mx-4`를 함께 사용 | 부모 너비보다 커져 가로 넘침이 생길 수 있음 |
| P0 | 문서 제목 | 제목 `min-w-[12rem]`, breadcrumb, 저장 배지가 한 행에 배치 | 320~375px에서 압축 또는 넘침 가능 |
| P0 | 페이지 트리 | 작업 버튼이 hover/focus 때만 표시됨 | 터치 사용자가 기능을 발견하거나 실행하기 어려움 |
| P0 | 페이지 이동 | native `draggable`에 의존 | 모바일 브라우저에서 신뢰하기 어려움 |
| P1 | 터치 대상 | 24~36px 버튼이 다수 존재 | 오동작 및 접근성 저하 |
| P1 | 설정 패널 | 헤더 기준 드롭다운 | 작은 화면과 키보드가 열린 상태에서 공간 부족 가능 |
| P1 | 이미지 액션 | 이미지 복사 버튼이 `group-hover`에 의존 | 터치 환경에서 접근하기 어려움 |
| P2 | 입력 크기 | 일부 입력이 `text-sm` | iOS에서 포커스 시 화면이 확대될 수 있음 |

## 구현 원칙

- 모바일과 데스크톱의 데이터 및 비즈니스 로직은 공유한다.
- 모바일 분기는 CSS media query와 최소한의 UI 상태로 제한한다.
- 모바일에 drag-and-drop을 억지로 재현하기보다 명시적인 이동 메뉴를 우선한다.
- hover는 보조 효과로만 사용하고, 핵심 기능의 유일한 진입점으로 사용하지 않는다.
- 오버레이는 focus 이동, 닫기, 배경 스크롤 잠금까지 하나의 동작으로 구현한다.
- breakpoint는 우선 기존 Tailwind `md` 기준을 유지한다.

---

## Phase 1 — 모바일 기본 레이아웃 (P0)

### 1.1 앱 viewport 안정화

**대상 파일**

- Modify: `components/notion-lite-app.tsx`
- Modify: `components/auth-panel.tsx`
- Modify: `app/globals.css` (필요 시)

**작업**

- [x] 앱 루트의 `h-screen`을 동적 viewport 단위(`h-dvh`) 기반으로 변경한다.
- [x] 구형 브라우저 fallback이 필요하면 CSS에서 `100vh` 후 `100dvh` 순으로 선언한다.
- [x] 헤더·드로어·하단 액션에 `env(safe-area-inset-*)`를 반영한다.
- [x] 모바일에서 body 또는 앱 외부에 이중 스크롤이 생기지 않도록 스크롤 소유자를 문서 영역으로 한정한다.

**완료 조건:** 모바일 주소창이 접히거나 펼쳐지고 키보드가 열려도 앱 하단과 문서 편집 영역에 접근할 수 있다.

### 1.2 사이드바를 모바일 드로어로 전환

**대상 파일**

- Modify: `components/notion-lite-app.tsx`
- Modify: `components/notion-lite/app-header.tsx`
- Modify: `components/notion-lite/workspace-sidebar.tsx`

**작업**

- [x] `mobileSidebarOpen` 상태와 열기/닫기 핸들러를 앱 루트에 추가한다.
- [x] 헤더에 모바일 전용 페이지 탐색 버튼을 추가하고 `aria-expanded`, `aria-controls`를 연결한다.
- [x] `md` 이상에서는 기존 고정 사이드바와 크기 조절을 그대로 유지한다.
- [x] `md` 미만에서는 사이드바를 fixed drawer와 backdrop으로 표시한다.
- [x] 페이지 또는 워크스페이스 선택 시 모바일 드로어를 자동으로 닫는다.
- [x] backdrop 클릭과 Escape로 닫는다. 모바일 브라우저 뒤로가기 연동은 후속 검토한다.
- [ ] 드로어가 열리면 포커스를 드로어로 이동하고 내부에 가둔다. 앱 루트가 이미 스크롤을 소유하므로 배경 스크롤은 발생하지 않는다.
- [ ] 닫을 때 포커스를 탐색 버튼으로 돌려준다.

**완료 조건:** 모바일 첫 화면에는 문서가 표시되고, 사용자는 헤더 버튼으로 페이지 목록을 열고 선택한 뒤 곧바로 문서를 편집할 수 있다.

### 1.3 문서 카드와 제목 행 정리

**대상 파일**

- Modify: `components/notion-lite/document-pane.tsx`

**작업**

- [x] 모바일의 `w-full` + `mx-4` 조합을 `w-auto`와 작은 margin 조합으로 변경한다.
- [x] 모바일 여백·padding·shadow를 줄여 실제 편집 폭을 확보한다.
- [x] 제목 입력을 `min-w-0`로 변경한다.
- [x] 모바일에서는 breadcrumb를 마지막 상위 항목 중심으로 축약한다.
- [x] 저장 상태 배지를 제목과 경쟁하지 않는 위치로 옮긴다.
- [ ] 긴 제목, 깊은 breadcrumb, 오류 배너에서 가로 넘침이 없는지 확인한다.

**완료 조건:** 320px 화면에서 긴 제목과 깊은 페이지 경로를 표시해도 가로 스크롤이 생기지 않는다.

---

## Phase 2 — 터치 상호작용 (P0/P1)

### 2.1 터치 대상 크기와 입력 확대 방지

**대상 파일**

- Modify: `components/notion-lite/app-header.tsx`
- Modify: `components/notion-lite/workspace-sidebar.tsx`
- Modify: `components/notion-lite/page-tree.tsx`
- Modify: `components/notion-lite/settings-panel.tsx`
- Modify: 기타 모바일에서 사용하는 dialog/search 컴포넌트

**작업**

- [x] 헤더·사이드바·검색·설정·삭제 확인 등 주요 버튼의 모바일 터치 영역을 최소 44×44px로 확보한다.
- [ ] 아이콘의 시각적 크기는 유지하되 padding 또는 투명 hit area로 터치 영역을 넓힌다.
- [x] 주요 모바일 입력은 `text-base`, `sm:text-sm` 형태로 적용해 iOS 자동 확대를 방지한다.
- [ ] 아이콘 전용 버튼에 한국어 `aria-label`을 제공한다.
- [ ] active, focus-visible, disabled 상태가 시각적으로 구분되는지 확인한다.

**완료 조건:** 확대 없이 한 손 터치로 주요 메뉴와 편집 기능을 안정적으로 사용할 수 있다.

### 2.2 페이지 작업 메뉴 제공

**대상 파일**

- Modify: `components/notion-lite/page-tree.tsx`
- Modify: `components/notion-lite-app.tsx`
- Create: `components/notion-lite/page-actions-menu.tsx` (필요 시)

**작업**

- [x] hover 전용 하위 페이지 추가, 삭제, 다운로드 버튼을 모바일의 `⋯` 메뉴로 통합한다.
- [ ] 데스크톱 hover 액션은 유지하되 키보드만으로도 접근할 수 있게 한다.
- [ ] 모바일 메뉴에 하위 페이지 추가, 이름 변경, 이동, 다운로드, 삭제를 제공한다.
- [ ] 삭제처럼 되돌리기 어려운 작업은 기존 확인 dialog를 유지한다.
- [x] 메뉴를 열어도 행 선택이 동시에 실행되지 않도록 이벤트 전파를 제어한다.

**완료 조건:** hover 없이 모든 페이지 작업을 찾고 실행할 수 있다.

### 2.3 모바일 페이지 이동 대체 수단

**대상 파일**

- Modify: `components/notion-lite/page-tree.tsx`
- Modify or Create: 페이지 이동 dialog/sheet

**작업**

- [ ] 데스크톱에서는 기존 drag-and-drop을 유지한다.
- [ ] 모바일에서는 native `draggable`을 핵심 이동 수단으로 사용하지 않는다.
- [ ] 이동 메뉴에서 대상 상위 페이지와 위치를 명시적으로 선택하도록 한다.
- [ ] 최소 기능으로 최상위로 이동, 특정 페이지 하위로 이동을 제공한다.
- [ ] 같은 위치, 자기 자신, 자기 자손을 대상으로 선택하지 못하게 한다.
- [ ] 서버의 workspace/cycle 검증 오류를 사용자에게 이해 가능한 메시지로 표시한다.

**완료 조건:** 터치만으로 페이지를 안전하게 이동할 수 있고 cycle 또는 잘못된 부모가 생성되지 않는다.

---

## Phase 3 — 오버레이와 편집기 보완 (P1)

### 3.1 설정 패널 모바일 바텀시트

**대상 파일**

- Modify: `components/notion-lite/app-header.tsx`
- Modify: `components/notion-lite/settings-panel.tsx`

**작업**

- [x] 데스크톱에서는 현재 dropdown을 유지한다.
- [x] 모바일에서는 화면 하단 sheet로 표시한다.
- [x] `max-height`, 내부 스크롤, safe-area 하단 위치를 적용한다.
- [ ] 멤버 이메일 입력 시 화면 키보드가 초대 버튼을 가리지 않게 한다.
- [ ] focus trap, Escape, backdrop, 닫기 버튼을 지원한다.

**완료 조건:** 320px 화면 및 키보드가 열린 상태에서도 멤버 확인·초대·로그아웃을 수행할 수 있다.

### 3.2 편집기와 이미지 액션

**대상 파일**

- Modify: `components/document-editor.tsx`
- Modify: 관련 editor extension/style

**작업**

- [x] 이미지 복사처럼 `group-hover`에만 의존하는 액션을 터치에서 노출한다.
- [x] 모바일에서는 이미지 복사 버튼을 항상 표시한다.
- [ ] 표와 코드 블록의 가로 스크롤이 문서 전체 스크롤과 충돌하지 않는지 확인한다.
- [ ] 붙여넣기만으로 이미지 추가가 어려운 환경을 위해 파일 선택 진입점 필요 여부를 검토한다.
- [ ] 에디터 toolbar가 있다면 모바일에서 줄바꿈 또는 가로 스크롤되도록 한다.

**완료 조건:** 핵심 편집 액션이 hover 없이 사용 가능하고 표·코드·이미지가 화면 전체 가로 넘침을 만들지 않는다.

---

## Phase 4 — 검증 및 회귀 방지

### 테스트 화면

- 320×568: 최소 지원 폭
- 375×667: 소형 iPhone 계열
- 390×844: 일반 iPhone 계열
- 430×932: 대형 모바일
- 768×1024: breakpoint 경계 및 태블릿
- 모바일 가로 모드
- 화면 키보드가 열린 상태
- dark mode는 현재 제품이 지원할 때만 회귀 대상으로 포함

### 핵심 시나리오

- [ ] 로그인·회원가입 및 인증 오류 확인
- [ ] 워크스페이스 선택·생성·이름 변경
- [ ] 페이지 검색·생성·선택·하위 페이지 생성
- [ ] 페이지 이동·다운로드·삭제
- [ ] 긴 제목과 깊은 breadcrumb 편집
- [ ] 본문 입력·스크롤·자동 저장 상태 확인
- [ ] 이미지·표·코드 블록 확인
- [ ] 설정 열기·멤버 초대·로그아웃
- [ ] drawer/sheet/dialog의 backdrop, Escape, 포커스 복귀
- [ ] 200% 확대 및 키보드 탐색 기본 확인

### 자동 검증 후보

- [ ] viewport별 수평 overflow 검사(`scrollWidth <= clientWidth`)
- [ ] drawer를 열고 페이지 선택 시 닫히는 동작
- [ ] 모바일 페이지 액션 메뉴의 생성·이동·삭제 흐름
- [ ] dialog/sheet의 접근 가능한 이름과 focus 이동
- [ ] 데스크톱 sidebar resize 및 drag-and-drop 회귀

### 기본 검증 명령

```sh
npm run typecheck
npm run test:image-assets
npm run test:editor-paste-priority
npm run build
```

브라우저 자동화가 추가되어 있다면 모바일 viewport 테스트를 production build 기준으로 함께 실행한다.

## 권장 구현 순서

1. `h-dvh`, 문서 폭, 제목 행의 레이아웃 오류를 먼저 수정한다.
2. 헤더 탐색 버튼과 모바일 sidebar drawer를 구현한다.
3. 버튼 터치 영역과 모바일 입력 글꼴을 일괄 정리한다.
4. 페이지 `⋯` 메뉴와 명시적 이동 UI를 구현한다.
5. 설정 panel과 이미지 액션을 모바일에 맞게 전환한다.
6. viewport별 수동 검증 후 핵심 흐름을 자동화한다.

## 가장 위험한 적용 지점

사이드바를 drawer로 바꾸면서 페이지 선택, 외부 클릭 감지, Escape 처리, 기존 workspace menu가 중첩될 수 있다. 오버레이 상태를 각각 독립적으로 열어두지 말고, 모바일 sidebar가 닫힐 때 workspace menu도 닫히도록 상태 전이를 명확히 해야 한다. 또한 페이지 이동 UI는 클라이언트에서 잘못된 대상을 숨기더라도 서버와 DB의 동일 workspace 및 cycle 검증을 최종 방어선으로 유지한다.

## 1차 구현 후 전반 UI 검토 결과

### 2026-09-26 추가 보완

- [x] `app/layout.tsx`에 `width=device-width`, `initialScale=1`, `viewportFit=cover` viewport 설정을 명시했다.
- [x] 모바일 사이드바의 `visibility`·transform 기반 표시를 실제 `hidden`/`flex` 전환으로 단순화해 세로 화면에서 회전 전까지 보이지 않던 repaint 문제를 제거했다.
- [x] 페이지 작업 메뉴를 우클릭과 `⋯`가 공유하는 컴포넌트로 통합하고 모바일에서는 bottom sheet로 표시한다.
- [x] 넓은 표가 문서 컨테이너를 확장하지 않고 표 wrapper 안에서만 가로 스크롤되도록 폭을 제한했다.
- [x] 모바일 헤더에서 새로고침 대신 페이지 검색을 바로 노출하고, 데스크톱의 sidebar 검색 위치는 유지했다.
- [x] 설정 패널의 모바일 breakpoint를 앱과 같은 `md`로 통일하고, 화면 하단에 붙는 full-width sheet와 backdrop으로 정리했다.
- [ ] 실제 iOS Safari와 Android Chrome에서 세로 첫 진입, 회전, 키보드 노출 상태를 추가 확인한다.

### P1 — 다음 구현 권장

- [ ] 모바일 페이지 작업 메뉴에 이름 변경과 명시적 이동 대상 선택 UI를 추가한다. 현재 생성·다운로드·삭제까지만 터치 메뉴로 제공한다.
- [ ] drawer, 설정 sheet, 검색 modal, 삭제 dialog에 공통 focus trap과 트리거 포커스 복귀 유틸리티를 적용한다.
- [ ] 워크스페이스 순서 변경도 native drag 외에 위/아래 이동 버튼을 제공한다.
- [ ] 성공·실패 피드백을 화면 상단 고정 오류문 대신 공통 toast/status 영역으로 통일하고 `aria-live`를 적용한다.
- [ ] 검색 결과와 긴 페이지 트리에서 현재 항목이 화면 안으로 자동 스크롤되는지 보장한다.

### P2 — 디자인 일관성 개선

- [ ] Settings, Members, Add, Logout 등 영어 UI와 한국어 UI를 한 언어로 통일한다.
- [ ] 반복되는 버튼 색상·shadow·focus-visible 클래스를 공통 variant로 정리한다.
- [ ] destructive action의 빨간색, 저장 상태의 초록색, 로딩 상태 표현을 공통 토큰으로 정의한다.
- [ ] 빈 상태에서 다음 행동 버튼을 직접 제공해 설명 문구만 표시되는 화면을 줄인다.
- [ ] `prefers-reduced-motion`에서 hover 이동·drawer transition·loading animation을 줄인다.

### 검증 제약

- `npm run typecheck`와 세 개의 회귀 테스트는 통과했다.
- 현재 실행 환경에서는 Turbopack의 CSS 처리 프로세스가 포트를 열지 못해 `npm run build`가 코드 컴파일 전에 중단된다.
- Webpack 대체 build는 현재 `typescript@6`의 `--showConfig` 출력과 Next build 도구 간 호환 문제로 중단된다. CI 또는 일반 개발 환경에서 production build를 다시 확인해야 한다.

## 배포 완료 기준

- [ ] 320px 이상에서 앱 전체 수평 스크롤이 없다.
- [ ] 모바일 첫 화면에서 문서 편집 영역이 주 콘텐츠로 표시된다.
- [ ] 모바일의 모든 핵심 기능이 hover와 native drag 없이 동작한다.
- [ ] 주요 터치 대상이 최소 44×44px이다.
- [ ] 키보드가 열린 상태에서도 제목·본문·설정 입력과 제출이 가능하다.
- [ ] drawer, sheet, dialog의 포커스·닫기·스크롤 잠금이 검증됐다.
- [ ] 데스크톱 sidebar resize와 페이지 drag-and-drop 회귀가 없다.
- [ ] typecheck, 관련 테스트, production build가 통과한다.
