import { z } from 'zod';

// ============================================================
// Agent Output Schemas — Zod-validated structured output
// ============================================================

// ResearchAgent output
export const keywordSuggestionSchema = z.object({
  text: z.string(),
  avg_monthly_searches: z.number().nullable(),
  competition: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable(),
  suggested_bid_micros: z.number().nullable(),
  relevance_score: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional(),
});

export const audienceSegmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

export const researchOutputSchema = z.object({
  keywords: z.array(keywordSuggestionSchema).min(1),
  negative_keyword_suggestions: z.array(z.string()),
  audience_segments: z.array(audienceSegmentSchema),
  competitor_observations: z.array(z.object({
    domain: z.string(),
    observed_keywords: z.array(z.string()).optional(),
    ad_copy_themes: z.array(z.string()).optional(),
  })),
  strategic_summary: z.string(),
});

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

// CampaignBuilderAgent output
export const campaignBlueprintAdSchema = z.object({
  headlines: z.array(z.object({
    text: z.string().max(30),
    pinned_position: z.number().nullable().optional(),
  })).min(3).max(15),
  descriptions: z.array(z.object({
    text: z.string().max(90),
    pinned_position: z.number().nullable().optional(),
  })).min(2).max(4),
  final_urls: z.array(z.string()),
  path1: z.string().max(15).optional(),
  path2: z.string().max(15).optional(),
});

export const campaignBlueprintKeywordSchema = z.object({
  text: z.string(),
  match_type: z.enum(['BROAD', 'PHRASE', 'EXACT']),
  cpc_bid_micros: z.number().optional(),
});

export const campaignBlueprintAdGroupSchema = z.object({
  name: z.string(),
  cpc_bid_micros: z.number().optional(),
  ads: z.array(campaignBlueprintAdSchema).min(1),
  keywords: z.array(campaignBlueprintKeywordSchema).min(1),
  negative_keywords: z.array(z.string()).optional(),
});

export const campaignBlueprintSchema = z.object({
  campaign: z.object({
    name: z.string(),
    campaign_type: z.enum(['SEARCH', 'DISPLAY', 'SHOPPING', 'VIDEO', 'PERFORMANCE_MAX', 'DEMAND_GEN', 'APP']),
    budget_amount_micros: z.number(),
    bidding_strategy: z.enum([
      'MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA',
      'TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_IMPRESSION_SHARE',
    ]),
    target_cpa_micros: z.number().optional(),
    target_roas: z.number().optional(),
    geo_targets: z.array(z.object({
      country: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
    })),
    language_targets: z.array(z.string()),
    network_settings: z.object({
      search: z.boolean(),
      display: z.boolean(),
      partners: z.boolean(),
    }),
  }),
  ad_groups: z.array(campaignBlueprintAdGroupSchema).min(1),
  negative_keywords_campaign_level: z.array(z.string()).optional(),
  reasoning: z.string(),
});

export type CampaignBlueprint = z.infer<typeof campaignBlueprintSchema>;

// CopywriterAgent output
export const adCopyVariantsSchema = z.object({
  variants: z.array(z.object({
    headlines: z.array(z.object({
      text: z.string().max(30),
      pinned_position: z.number().nullable().optional(),
    })).min(3).max(15),
    descriptions: z.array(z.object({
      text: z.string().max(90),
      pinned_position: z.number().nullable().optional(),
    })).min(2).max(4),
    theme: z.string(), // e.g. "benefit-focused", "urgency", "social-proof"
  })),
  reasoning: z.string(),
});

export type AdCopyVariants = z.infer<typeof adCopyVariantsSchema>;

// OptimizerAgent output
export const optimizationRecommendationSchema = z.object({
  action_type: z.string(), // pause_keyword, increase_bid, decrease_budget, etc.
  entity_type: z.string(),
  entity_id: z.string(),
  entity_name: z.string(),
  current_value: z.unknown(),
  proposed_value: z.unknown(),
  reasoning: z.string(),
  confidence_score: z.number().min(0).max(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  expected_impact: z.string().optional(),
});

export const optimizerOutputSchema = z.object({
  recommendations: z.array(optimizationRecommendationSchema),
  analysis_summary: z.string(),
  performance_trend: z.enum(['improving', 'stable', 'declining', 'volatile']),
  data_period_days: z.number(),
});

export type OptimizerOutput = z.infer<typeof optimizerOutputSchema>;

// OrchestratorAgent — intent parsing
export const userIntentSchema = z.object({
  intent: z.enum([
    'research_keywords',
    'build_campaign',
    'optimize_campaigns',
    'generate_ad_copy',
    'check_performance',
    'modify_campaign',
    'pause_resume',
    'general_question',
    'unknown',
  ]),
  entities: z.object({
    business_description: z.string().optional(),
    target_audience: z.string().optional(),
    campaign_id: z.string().optional(),
    campaign_name: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    budget: z.number().optional(),
    geo_targets: z.array(z.string()).optional(),
  }),
  follow_up_questions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});

export type UserIntent = z.infer<typeof userIntentSchema>;
