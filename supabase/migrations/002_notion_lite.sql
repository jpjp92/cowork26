-- =============================================
-- Cowork26 — Notion-lite 협업 문서 스키마
-- 작성일: 2026-05-14
-- =============================================

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  order_index INT NOT NULL DEFAULT 0,
  content JSONB,
  ydoc_state BYTEA,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS pages_workspace_id_idx ON pages(workspace_id);
CREATE INDEX IF NOT EXISTS pages_parent_id_idx ON pages(parent_id);

CREATE OR REPLACE FUNCTION update_pages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pages_updated_at ON pages;
CREATE TRIGGER pages_updated_at
  BEFORE UPDATE ON pages
  FOR EACH ROW EXECUTE FUNCTION update_pages_updated_at();

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_member_select" ON workspaces;
CREATE POLICY "workspaces_member_select" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspaces_owner_insert" ON workspaces;
CREATE POLICY "workspaces_owner_insert" ON workspaces
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "workspaces_owner_update" ON workspaces;
CREATE POLICY "workspaces_owner_update" ON workspaces
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id AND user_id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "workspace_members_select" ON workspace_members;
CREATE POLICY "workspace_members_select" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "workspace_members_owner_insert" ON workspace_members;
CREATE POLICY "workspace_members_owner_insert" ON workspace_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

DROP POLICY IF EXISTS "pages_member_select" ON pages;
CREATE POLICY "pages_member_select" ON pages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = pages.workspace_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pages_editor_insert" ON pages;
CREATE POLICY "pages_editor_insert" ON pages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = pages.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "pages_editor_update" ON pages;
CREATE POLICY "pages_editor_update" ON pages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = pages.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "pages_editor_delete" ON pages;
CREATE POLICY "pages_editor_delete" ON pages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = pages.workspace_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );
