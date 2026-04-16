-- ============================================================
-- Migration 010: OptimizerAgent plumbing — source tracking + outcome measurement
-- ============================================================
--
-- Three additive columns on `approval_queue` that turn the approval queue into
-- a closed-loop optimization system:
--
--   1. `optimization_source` — which OptimizerAgent sub-analysis generated
--      the recommendation. Drives the source chip on the approvals queue UI
--      and lets us measure which analyses are producing the best outcomes.
--
--   2. `outcome_measured_at` — when the measure-outcomes cron last wrote
--      `actual_impact` for this approval. NULL means outcome hasn't been
--      measured yet (either the approval hasn't been applied, or it's been
--      applied for <14 days and we're waiting for signal to stabilize).
--
--   3. `actual_impact` — JSONB parallel to `predicted_impact` (from
--      migration 009). Populated ~14 days after apply by the measure-outcomes
--      cron. Used by the "Prediction vs actual" card on the approval detail
--      page and by the OptimizerAgent's hit-rate tracker for self-calibration.
--
-- `performance_snapshots.quality_score` already exists in the base schema
-- (complete_schema.sql:189) — no column add needed. Sync layer just needs to
-- start populating it (done in src/lib/google-ads/sync.ts).
--
-- ============================================================

-- ---------- optimization_source ----------
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS optimization_source TEXT;

COMMENT ON COLUMN approval_queue.optimization_source IS
  'Which OptimizerAgent sub-analysis generated this recommendation. '
  'Examples: bid-efficiency, landing-page-roi, search-terms-harvest, '
  'quality-score-decay, budget-pacing, competitor-auction. NULL for '
  'non-optimizer approvals (e.g. chat-generated campaign builds).';

-- ---------- outcome_measured_at ----------
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS outcome_measured_at TIMESTAMPTZ;

COMMENT ON COLUMN approval_queue.outcome_measured_at IS
  'Timestamp the measure-outcomes cron wrote actual_impact. NULL means '
  'outcome has not been measured yet. The cron waits ~14 days after apply '
  'for signal to stabilize before measuring.';

-- ---------- actual_impact ----------
-- JSONB shape mirrors predicted_impact (migration 009) so the UI can render
-- a side-by-side comparison:
--   {
--     "revenue_delta_micros": 2150000000,      // actual measured delta
--     "conversion_delta": 9,
--     "cost_delta_micros": 480000000,
--     "cpa_delta_micros": -1100000000,
--     "roas_delta": 0.35,
--     "timeframe": "monthly",                   // same units as prediction
--     "measurement_window_days": 14,            // how long we watched after apply
--     "baseline_source": "prev_14d_vs_post_14d",// how the baseline was computed
--     "accuracy": 0.86                          // abs(actual-predicted)/predicted
--                                               // on the primary metric — used
--                                               // by OptimizerAgent to track its
--                                               // own hit rate over time
--   }
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS actual_impact JSONB;

COMMENT ON COLUMN approval_queue.actual_impact IS
  'Measured outcome of applying this change. Written by measure-outcomes '
  'cron ~14 days post-apply. See migration 010 for shape.';

-- ---------- Index for the measure-outcomes cron query ----------
-- The cron needs to efficiently find "applied approvals older than N days
-- that haven't been measured yet". A partial index on applied_at for rows
-- where outcome_measured_at IS NULL is exactly that shape.
CREATE INDEX IF NOT EXISTS idx_approvals_awaiting_outcome
  ON approval_queue (applied_at)
  WHERE status = 'applied' AND outcome_measured_at IS NULL;

-- ---------- Index for source-filtered approval queries ----------
-- The approvals queue UI will let users filter by optimization_source.
-- Combined with status (already the hottest filter), a composite index
-- speeds up "pending approvals from bid-efficiency" style queries.
CREATE INDEX IF NOT EXISTS idx_approvals_source_status
  ON approval_queue (optimization_source, status, created_at DESC)
  WHERE optimization_source IS NOT NULL;

-- ============================================================
-- End of migration 010
-- ============================================================
