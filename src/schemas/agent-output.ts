import { z } from 'zod';

// ============================================================
// Agent Output Schemas — Zod-validated structured output
// ============================================================

// ---- Competitor Deep Analysis (NEW for Phase 3) ----

export const competitorDeepAnalysisSchema = z.object({
  domain: z.string(),
  company_name: z.string().optional(),
  recent_content: z.array(z.object({
    title: z.string(),
    url: z.string().optional(),
    type: z.string(), // blog, case_study, whitepaper, landing_page
    summary: z.string(),
    published_date: z.string().optional(),
  })),
  hiring_signals: z.array(z.object({
    role: z.string(),
    department: z.string().optional(),
    inference: z.string(), // what this hire tells us about their strategy
  })),
  ad_presence: z.object({
    observed_keywords: z.array(z.string()),
    ad_copy_themes: z.array(z.string()),
    estimated_monthly_spend: z.string().optional(), // e.g. "$10K-$50K"
  }).optional(),
  strategic_inference: z.string(), // AI's deep reasoning about what this competitor is doing
  threat_level: z.enum(['low', 'medium', 'high', 'critical']),
  opportunities_against: z.array(z.string()), // gaps/weaknesses we can exploit
});

export type CompetitorDeepAnalysis = z.infer<typeof competitorDeepAnalysisSchema>;

export const marketOpportunitySchema = z.object({
  opportunity: z.string(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  suggested_action: z.string(),
  related_competitors: z.array(z.string()),
});

export type MarketOpportunity = z.infer<typeof marketOpportunitySchema>;

// ---- ResearchAgent Output ----

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
  keywords: z.array(keywordSuggestionSchema).optional().default([]),
  negative_keyword_suggestions: z.array(z.string()).optional().default([]),
  audience_segments: z.array(audienceSegmentSchema).optional().default([]),
  competitor_observations: z.array(z.object({
    domain: z.string(),
    observed_keywords: z.array(z.string()).optional(),
    ad_copy_themes: z.array(z.string()).optional(),
  })).optional().default([]),
  competitor_deep_analysis: z.array(competitorDeepAnalysisSchema).optional(),
  market_opportunities: z.array(z.object({
    opportunity: z.string(),
    reasoning: z.string().optional().default(''),
    confidence: z.number().min(0).max(1).optional().default(0.5),
    suggested_action: z.string().optional().default(''),
    related_competitors: z.array(z.string()).optional().default([]),
  })).optional(),
  strategic_summary: z.string().optional().default('Research completed.'),
}).passthrough(); // Allow extra fields the AI might return

export type ResearchOutput = z.infer<typeof researchOutputSchema>;

// ---- CampaignBuilderAgent Output ----

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

// ---- CopywriterAgent Output (Extended for Phase 3) ----

export const trackingUrlSchema = z.object({
  base_url: z.string(),
  utm_source: z.string().default('google'),
  utm_medium: z.string().default('cpc'),
  utm_campaign: z.string(),
  utm_content: z.string().optional(),
  icp_param: z.string().optional(), // e.g. "cio", "cto", "vp_engineering"
  custom_params: z.record(z.string()).optional(),
  full_url: z.string(), // the complete assembled URL
});

export type TrackingUrl = z.infer<typeof trackingUrlSchema>;

export const suggestedImageSchema = z.object({
  unsplash_id: z.string(),
  url: z.string(),
  thumb_url: z.string(),
  alt_text: z.string(),
  photographer: z.string(),
  relevance_reasoning: z.string(), // why this image fits the ad
});

export type SuggestedImage = z.infer<typeof suggestedImageSchema>;

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
  tracking_urls: z.array(trackingUrlSchema).optional(),
  suggested_images: z.array(suggestedImageSchema).optional(),
  reasoning: z.string(),
});

export type AdCopyVariants = z.infer<typeof adCopyVariantsSchema>;

// ---- OptimizerAgent Output ----

export const optimizationRecommendationSchema = z.object({
  action_type: z.string(),
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

// ---- OrchestratorAgent — Intent Parsing ----

const VALID_INTENTS = [
  'research_keywords', 'build_campaign', 'optimize_campaigns', 'generate_ad_copy',
  'check_performance', 'modify_campaign', 'pause_resume', 'general_question', 'unknown',
] as const;

// Map common AI variations to valid intents
const INTENT_ALIASES: Record<string, typeof VALID_INTENTS[number]> = {
  'create_campaign': 'build_campaign',
  'new_campaign': 'build_campaign',
  'setup_campaign': 'build_campaign',
  'launch_campaign': 'build_campaign',
  'keyword_research': 'research_keywords',
  'find_keywords': 'research_keywords',
  'research': 'research_keywords',
  'write_copy': 'generate_ad_copy',
  'write_ads': 'generate_ad_copy',
  'ad_copy': 'generate_ad_copy',
  'create_ads': 'generate_ad_copy',
  'optimize': 'optimize_campaigns',
  'performance': 'check_performance',
  'view_performance': 'check_performance',
  'pause': 'pause_resume',
  'resume': 'pause_resume',
  'edit_campaign': 'modify_campaign',
  'update_campaign': 'modify_campaign',
  'question': 'general_question',
  'help': 'general_question',
};

export const userIntentSchema = z.object({
  intent: z.string().transform((val) => {
    const lower = val.toLowerCase().trim();
    if ((VALID_INTENTS as readonly string[]).includes(lower)) return lower as typeof VALID_INTENTS[number];
    if (INTENT_ALIASES[lower]) return INTENT_ALIASES[lower];
    // Fuzzy match: if it contains a known intent keyword, use it
    for (const intent of VALID_INTENTS) {
      if (lower.includes(intent) || intent.includes(lower)) return intent;
    }
    return 'unknown' as const;
  }),
  entities: z.object({
    business_description: z.string().optional(),
    target_audience: z.string().optional(),
    campaign_id: z.string().optional(),
    campaign_name: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    budget: z.number().optional(),
    geo_targets: z.array(z.string()).optional(),
    competitor_domains: z.array(z.string()).optional(),
    landing_page_url: z.string().optional(),
  }),
  follow_up_questions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export type UserIntent = z.infer<typeof userIntentSchema>;

// ---- Orchestrator Execution Plan ----

// Coerce any value to string safely
const toStr = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  return String(v);
};

const executionStepSchema = z.record(z.unknown()).transform((raw) => {
  // Extract agent name from any key variation
  const agent = toStr(raw.agent) || toStr(raw.agent_name) || toStr(raw.tool) || 'ResearchAgent';
  // Extract action description from any key variation
  const action = toStr(raw.action) || toStr(raw.description) || toStr(raw.task)
    || toStr(raw.name) || toStr(raw.detail) || toStr(raw.details)
    || (typeof raw.step === 'string' ? raw.step : undefined)
    || 'execute';
  const depends_on = Array.isArray(raw.depends_on) ? raw.depends_on.map(Number) : undefined;

  return { agent, action, depends_on };
});

export const executionPlanSchema = z.object({
  summary: z.string().optional().default('Execute the requested campaign operations.'),
  // Accept "steps", "plan", "tasks", or "actions" as the array key
  steps: z.array(executionStepSchema).optional(),
  plan: z.array(executionStepSchema).optional(),
  tasks: z.array(executionStepSchema).optional(),
  actions: z.array(executionStepSchema).optional(),
  suggested_competitors: z.array(z.object({
    domain: z.string(),
    reason: z.string().optional().default(''),
  })).optional(),
  estimated_budget_range: z.object({
    min_daily_micros: z.number(),
    max_daily_micros: z.number(),
    reasoning: z.string().optional().default(''),
  }).optional(),
  needs_user_input: z.array(z.string()).optional(),
}).passthrough().transform((data) => ({
  ...data,
  // Normalize: pick whichever array key the AI used
  steps: data.steps || data.plan || data.tasks || data.actions || [
    { agent: 'ResearchAgent', action: 'Research keywords and competitors' },
    { agent: 'CampaignBuilderAgent', action: 'Build campaign structure' },
    { agent: 'CopywriterAgent', action: 'Generate ad copy and tracking URLs' },
  ],
}));

export type ExecutionPlan = z.infer<typeof executionPlanSchema>;
