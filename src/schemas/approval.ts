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
