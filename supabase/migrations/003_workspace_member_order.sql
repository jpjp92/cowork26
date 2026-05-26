ALTER TABLE workspace_members
ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0;

WITH ranked_memberships AS (
  SELECT
    workspace_id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, workspace_id ASC) - 1 AS next_order_index
  FROM workspace_members
)
UPDATE workspace_members wm
SET order_index = ranked_memberships.next_order_index
FROM ranked_memberships
WHERE wm.workspace_id = ranked_memberships.workspace_id
  AND wm.user_id = ranked_memberships.user_id;
