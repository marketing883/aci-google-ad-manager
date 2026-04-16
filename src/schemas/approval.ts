import { z } from 'zod';

export const approvalPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const createApprovalSchema = z.object({
  action_type: z.string().min(1), // create_campaign, update_bid, pause_keyword, etc.
  entity_type: z.string().min(1), // campaign, ad_group, ad, keyword
  entity_id: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  previous_state: z.record(z.string(), z.unknown()).optional(),
  ai_reasoning: z.string().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
  priority: approvalPrioritySchema.default('normal'),
  agent_name: z.string().optional(),
});

export const approveSchema = z.object({
  reviewer_notes: z.string().optional(),
});

export const rejectSchema = z.object({
  reviewer_notes: z.string().min(1, 'Rejection reason is required'),
});

export const editBeforeApproveSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  reviewer_notes: z.string().optional(),
});

export const bulkApprovalSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['approve', 'reject']),
  reviewer_notes: z.string().optional(),
});

// ============================================================
// Recommendation — what OptimizerAgent produces on every cron run.
// A Recommendation is a createApprovalSchema + source + predicted impact +
// risk tier, all ready to become an approval_queue row once QASentinel
// validates it.
// ============================================================

export const optimizationSourceSchema = z.enum([
  'bid-efficiency',
  'landing-page-roi',
  'search-terms-harvest',
  'quality-score-decay',
  'budget-pacing',
  'competitor-auction',
  'dayparting',
  'attribution-rebalance',
]);

export const riskTierSchema = z.enum(['auto', 'review', 'blocked']);

// Mirrors approval_queue.predicted_impact JSONB (migration 009). The fields
// are all optional — a bid-efficiency recommendation might only fill
// conversion_delta + cpa_delta_micros; a budget-pacing one might only fill
// cost_delta_micros. Keep the shape permissive.
export const predictedImpactSchema = z.object({
  revenue_delta_micros: z.number().int().optional(),
  conversion_delta: z.number().optional(),
  cost_delta_micros: z.number().int().optional(),
  cpa_delta_micros: z.number().int().optional(),
  roas_delta: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  timeframe: z.enum(['daily', 'weekly', 'monthly']).optional(),
  explanation: z.string().optional(),
});

export const recommendationSchema = z.object({
  action_type: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: z.string().uuid().optional(),
  entity_name: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  previous_state: z.record(z.string(), z.unknown()).optional(),
  ai_reasoning: z.string(),
  confidence_score: z.number().min(0).max(1),
  priority: approvalPrioritySchema.default('normal'),
  agent_name: z.string().default('OptimizerAgent'),
  optimization_source: optimizationSourceSchema,
  predicted_impact: predictedImpactSchema,
  risk_tier: riskTierSchema,
});

export type Recommendation = z.infer<typeof recommendationSchema>;
export type PredictedImpact = z.infer<typeof predictedImpactSchema>;
export type OptimizationSource = z.infer<typeof optimizationSourceSchema>;
export type RiskTier = z.infer<typeof riskTierSchema>;
