-- =============================================
-- Cowork26 — 초기 스키마
-- Supabase SQL Editor에서 전체 실행
-- =============================================

-- 사용자 프로필
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- auth.users 신규 가입 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 스프레드시트 문서
CREATE TABLE IF NOT EXISTS sheets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL DEFAULT '제목 없음',
  owner_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 시트 updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sheets_updated_at ON sheets;
CREATE TRIGGER sheets_updated_at
  BEFORE UPDATE ON sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 시트별 공동 작업자
CREATE TABLE IF NOT EXISTS sheet_members (
  sheet_id  UUID REFERENCES sheets(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role      TEXT CHECK (role IN ('editor', 'viewer')) DEFAULT 'editor',
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (sheet_id, user_id)
);

-- 셀 데이터
CREATE TABLE IF NOT EXISTS cells (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id   UUID REFERENCES sheets(id) ON DELETE CASCADE,
  row        INT NOT NULL,
  col        INT NOT NULL,
  value      TEXT,
  formula    TEXT,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (sheet_id, row, col)
);

-- =============================================
-- RLS 활성화
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cells ENABLE ROW LEVEL SECURITY;

-- profiles: 본인만 조회/수정
DROP POLICY IF EXISTS "profiles_self" ON profiles;
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);

-- sheets: 오너 또는 멤버만 조회
DROP POLICY IF EXISTS "sheets_select" ON sheets;
CREATE POLICY "sheets_select" ON sheets
  FOR SELECT USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM sheet_members WHERE sheet_id = id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "sheets_insert" ON sheets;
CREATE POLICY "sheets_insert" ON sheets
  FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "sheets_update" ON sheets;
CREATE POLICY "sheets_update" ON sheets
  FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "sheets_delete" ON sheets;
CREATE POLICY "sheets_delete" ON sheets
  FOR DELETE USING (owner_id = auth.uid());

-- sheet_members: 오너 또는 본인만 조회
DROP POLICY IF EXISTS "members_select" ON sheet_members;
CREATE POLICY "members_select" ON sheet_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM sheets WHERE id = sheet_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "members_insert" ON sheet_members;
CREATE POLICY "members_insert" ON sheet_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sheets WHERE id = sheet_id AND owner_id = auth.uid())
  );

-- cells: 시트 멤버(editor) 또는 오너만 접근
DROP POLICY IF EXISTS "cells_select" ON cells;
CREATE POLICY "cells_select" ON cells
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sheet_members
      WHERE sheet_id = cells.sheet_id AND user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM sheets
      WHERE id = cells.sheet_id AND owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cells_all" ON cells;
CREATE POLICY "cells_all" ON cells
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sheet_members
      WHERE sheet_id = cells.sheet_id AND user_id = auth.uid() AND role = 'editor'
    ) OR EXISTS (
      SELECT 1 FROM sheets
      WHERE id = cells.sheet_id AND owner_id = auth.uid()
    )
  );
