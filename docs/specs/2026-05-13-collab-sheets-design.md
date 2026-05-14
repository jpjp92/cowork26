# Collab Sheets — 설계 문서

> 작성일: 2026-05-13

---

## 개요

소규모 팀(2~10명)이 웹 브라우저에서 구글 시트처럼 실시간 공동 편집할 수 있는 스프레드시트 서비스.
메모/텍스트 관리 위주, 기본 수식(SUM, AVG 등) 지원. Vercel 배포.

---

## 확정 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | React 19 + Vite + FortuneSheet |
| Backend | Vercel Functions (`/api`) |
| DB | Supabase PostgreSQL |
| Realtime | Supabase Realtime (broadcast) |
| Auth | Supabase Auth (이메일) |
| Deploy | Vercel |

---

## 아키텍처

```
Browser (FortuneSheet UI)
  ├── REST → /api/sheets          시트 목록 CRUD
  ├── REST → /api/sheets/:id/cells  셀 데이터 저장/조회
  └── Supabase Realtime (직접)   실시간 브로드캐스트

Vercel Functions (/api)
  ├── GET  /api/sheets             내 시트 목록
  ├── POST /api/sheets             새 시트 생성
  ├── GET  /api/sheets/:id/cells   셀 데이터 전체 조회
  ├── PUT  /api/sheets/:id/cells   셀 변경 저장
  └── POST /api/sheets/:id/members  공동 작업자 초대
  (Supabase Service Key는 서버에서만 사용)

Supabase
  ├── PostgreSQL — 영속 데이터
  └── Realtime broadcast — 셀 변경 실시간 전파
```

**Realtime 전략**: REST는 Vercel Functions 경유, Realtime만 브라우저에서 Supabase 직접 연결 (속도 우선).

---

## DB 테이블 설계

```sql
-- Supabase Auth 자동 생성
auth.users (id, email, ...)

-- 사용자 프로필
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 스프레드시트 문서
CREATE TABLE sheets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL DEFAULT '제목 없음',
  owner_id   UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 시트별 공동 작업자 및 권한
CREATE TABLE sheet_members (
  sheet_id UUID REFERENCES sheets(id) ON DELETE CASCADE,
  user_id  UUID REFERENCES profiles(id),
  role     TEXT CHECK (role IN ('editor', 'viewer')) DEFAULT 'editor',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (sheet_id, user_id)
);

-- 셀 데이터
CREATE TABLE cells (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id   UUID REFERENCES sheets(id) ON DELETE CASCADE,
  row        INT NOT NULL,
  col        INT NOT NULL,
  value      TEXT,
  formula    TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sheet_id, row, col)
);
```

---

## 실시간 협업 흐름

```
사용자 A가 셀 편집
  → 1. Vercel /api PUT 호출 → Supabase DB 저장
  → 2. Supabase Realtime broadcast (채널: sheet:{id})
         payload: { row, col, value, formula, updated_by }

사용자 B (같은 시트 구독 중)
  → broadcast 수신 → FortuneSheet 로컬 셀 업데이트
```

충돌 처리: 마지막 저장 우선(Last Write Wins). 셀 단위 편집이라 충돌 드뭄.

---

## 핵심 기능

### MVP
- [ ] 이메일 로그인 (Supabase Auth)
- [ ] 시트 생성 / 목록 / 삭제
- [ ] FortuneSheet 기반 스프레드시트 편집
- [ ] 셀 데이터 Supabase 저장 및 불러오기
- [ ] Supabase Realtime 실시간 동시 편집
- [ ] 공동 작업자 초대 (이메일)

### 추후 확장
- 시트 내보내기 (XLSX)
- 뷰어/편집자 권한 분리 UI
- 셀 코멘트
- 버전 히스토리

---

## 프로젝트 구조

```
collab-sheets/
├── api/                    Vercel Functions
│   ├── sheets/
│   │   ├── index.ts        GET (목록), POST (생성)
│   │   └── [id]/
│   │       ├── cells.ts    GET / PUT
│   │       └── members.ts  POST (초대)
│   └── _lib/
│       └── supabase.ts     Supabase Admin Client
├── src/
│   ├── components/
│   │   ├── SheetList.tsx
│   │   ├── SheetEditor.tsx  FortuneSheet 래퍼
│   │   └── AuthForm.tsx
│   ├── hooks/
│   │   ├── useSheet.ts      셀 로드/저장
│   │   └── useRealtime.ts   Supabase broadcast
│   ├── lib/
│   │   └── supabase.ts      Supabase Anon Client
│   └── App.tsx
├── .env.local
├── package.json
└── vite.config.ts
```

---

## 환경 변수

```
SUPABASE_URL
SUPABASE_ANON_KEY          브라우저용 (Realtime)
SUPABASE_SERVICE_KEY       서버 전용 (Vercel Functions)
```

---

## 개발 순서 (권장)

1. Supabase 프로젝트 생성 + 테이블 마이그레이션
2. Supabase Auth 이메일 로그인 연결
3. Vercel Functions `/api/sheets` CRUD
4. FortuneSheet 연동 + 셀 저장
5. Supabase Realtime 브로드캐스트 연결
6. 공동 작업자 초대 기능
7. Vercel 배포 + 환경 변수 설정
