-- ============================================================
-- Migration 009: Predicted impact on approvals + entity linking on agent logs
-- ============================================================
--
-- Two schema extensions that close gaps the refactored UI exposed:
--
-- 1. `approval_queue.predicted_impact` — the agent's best guess at what
--    applying this change will do. The UI surfaces it prominently in the
--    approval detail page so the reviewer can weigh the expected upside
--    against the confidence score. JSONB shape is documented below.
--
-- 2. `agent_logs.entity_type` + `entity_id` + `entity_name` — lets us link
--    a log entry back to the campaign / ad group / ad / keyword it
--    affected. The Portfolio detail and Approval detail pages both
--    surface per-entity activity timelines and this is what drives them.
--
-- ============================================================

-- ---------- 1. predicted_impact on approval_queue ----------
--
-- Expected JSONB shape (all fields optional — agents fill what they know):
--
--   {
--     "revenue_delta_micros": 2500000000,    // +$2,500 monthly in micros
--     "conversion_delta": 12,                 // +12 conversions
--     "cost_delta_micros": 500000000,         // +$500 monthly spend delta
--     "cpa_delta_micros": -1200000000,        // -$120 CPA (lower = better)
--     "roas_delta": 0.4,                      // +0.4x ROAS
--     "confidence": 0.72,                     // 0..1 — the prediction's own
--                                             // certainty, separate from
--                                             // confidence_score which is the
--                                             // agent's confidence in the
--                                             // recommendation itself
--     "timeframe": "monthly",                 // daily | weekly | monthly
--     "explanation": "Based on the last 30 days trend at the current bid."
--   }

ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS predicted_impact JSONB;

COMMENT ON COLUMN approval_queue.predicted_impact IS
  'Agent-predicted outcome of applying this change. See migration 009 for shape.';

-- ---------- 2. entity linking on agent_logs ----------
--
-- Historically agent_logs only recorded the agent name + action. We couldn't
-- answer "what has the system done to THIS campaign?" without heuristic
-- matching on output_summary. These columns give us a direct join key and
-- a human-readable name for rendering in the UI.
--
-- entity_type mirrors approval_queue.entity_type: campaign | ad_group | ad |
-- keyword | negative_keyword | setting | other. entity_id is the target row's
-- UUID (or null if the action wasn't scoped to a specific entity, e.g. a
-- global optimization run). entity_name is denormalized for display — the UI
-- can render a timeline entry like "Paused 'Summer Sale 2024'" without
-- needing a join.

ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS entity_name TEXT;

COMMENT ON COLUMN agent_logs.entity_type IS
  'Type of entity this log entry affected (campaign, ad_group, ad, keyword, etc).';
COMMENT ON COLUMN agent_logs.entity_id IS
  'UUID of the affected entity, or NULL for global actions.';
COMMENT ON COLUMN agent_logs.entity_name IS
  'Human-readable name of the affected entity at the time of the action.';

-- Index so per-entity timeline queries are fast
CREATE INDEX IF NOT EXISTS idx_agent_logs_entity
  ON agent_logs (entity_type, entity_id, created_at DESC)
  WHERE entity_id IS NOT NULL;

-- ============================================================
-- End of migration 009
-- ============================================================
