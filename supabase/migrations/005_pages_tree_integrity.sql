-- pages.parent_id는 같은 workspace의 page만 참조하며 cycle을 만들 수 없다.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pages AS child
    JOIN pages AS parent ON parent.id = child.parent_id
    WHERE child.workspace_id <> parent.workspace_id
  ) THEN
    RAISE EXCEPTION 'Existing pages contain cross-workspace parent links';
  END IF;

  IF EXISTS (
    WITH RECURSIVE chains AS (
      SELECT id AS origin_id, parent_id, ARRAY[id] AS visited, FALSE AS is_cycle
      FROM pages

      UNION ALL

      SELECT chains.origin_id,
             parent.parent_id,
             chains.visited || parent.id,
             parent.id = ANY(chains.visited)
      FROM chains
      JOIN pages AS parent ON parent.id = chains.parent_id
      WHERE chains.parent_id IS NOT NULL
        AND NOT chains.is_cycle
    )
    SELECT 1 FROM chains WHERE is_cycle
  ) THEN
    RAISE EXCEPTION 'Existing pages contain a hierarchy cycle';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_pages_tree_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_workspace_id UUID;
  creates_cycle BOOLEAN;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A page cannot be its own parent' USING ERRCODE = '23514';
  END IF;

  SELECT workspace_id
  INTO parent_workspace_id
  FROM pages
  WHERE id = NEW.parent_id;

  IF parent_workspace_id IS NULL OR parent_workspace_id <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Parent page must belong to the same workspace' USING ERRCODE = '23514';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, ARRAY[id] AS visited
    FROM pages
    WHERE id = NEW.parent_id

    UNION ALL

    SELECT page.id, page.parent_id, ancestors.visited || page.id
    FROM pages AS page
    JOIN ancestors ON page.id = ancestors.parent_id
    WHERE NOT page.id = ANY(ancestors.visited)
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
  INTO creates_cycle;

  IF creates_cycle THEN
    RAISE EXCEPTION 'Page hierarchy cannot contain a cycle' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pages_tree_integrity ON pages;
CREATE TRIGGER pages_tree_integrity
  BEFORE INSERT OR UPDATE OF parent_id, workspace_id ON pages
  FOR EACH ROW EXECUTE FUNCTION enforce_pages_tree_integrity();
