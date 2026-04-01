import { z } from 'zod';

// ============================================================
// Campaign Schemas
// ============================================================

export const campaignTypeSchema = z.enum([
  'SEARCH', 'DISPLAY', 'SHOPPING', 'VIDEO', 'PERFORMANCE_MAX', 'DEMAND_GEN', 'APP',
]);

export const biddingStrategySchema = z.enum([
  'MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA',
  'TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_IMPRESSION_SHARE',
]);

export const geoTargetSchema = z.object({
  country: z.string().optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  radius_miles: z.number().optional(),
  location_id: z.string().optional(),
});

export const networkSettingsSchema = z.object({
  search: z.boolean().default(true),
  display: z.boolean().default(false),
  partners: z.boolean().default(false),
});

export const createCampaignSchema = z.object({
  google_ads_account_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  campaign_type: campaignTypeSchema.default('SEARCH'),
  budget_amount_micros: z.number().int().min(0),
  budget_type: z.string().default('DAILY'),
  bidding_strategy: biddingStrategySchema.default('MAXIMIZE_CLICKS'),
  target_cpa_micros: z.number().int().optional(),
  target_roas: z.number().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  geo_targets: z.array(geoTargetSchema).default([]),
  language_targets: z.array(z.string()).default([]),
  network_settings: networkSettingsSchema.default({ search: true, display: false, partners: false }),
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(['draft', 'pending_approval', 'approved', 'active', 'paused', 'ended', 'removed']).optional(),
});

// ============================================================
// Ad Group Schemas
// ============================================================

export const createAdGroupSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  cpc_bid_micros: z.number().int().min(0).optional(),
});

export const updateAdGroupSchema = createAdGroupSchema.partial().extend({
  status: z.enum(['draft', 'pending_approval', 'approved', 'active', 'paused', 'removed']).optional(),
});

// ============================================================
// Ad Schemas
// ============================================================

export const adTextAssetSchema = z.object({
  text: z.string().min(1),
  pinned_position: z.number().int().min(1).max(4).nullable().optional(),
});

export const headlineSchema = adTextAssetSchema.refine(
  (h) => h.text.length <= 30,
  { message: 'Headline must be 30 characters or fewer' }
);

export const descriptionSchema = adTextAssetSchema.refine(
  (d) => d.text.length <= 90,
  { message: 'Description must be 90 characters or fewer' }
);

export const createAdSchema = z.object({
  ad_group_id: z.string().uuid(),
  ad_type: z.enum(['RESPONSIVE_SEARCH', 'RESPONSIVE_DISPLAY', 'CALL_AD', 'EXPANDED_TEXT']).default('RESPONSIVE_SEARCH'),
  headlines: z.array(adTextAssetSchema).min(3).max(15),
  descriptions: z.array(adTextAssetSchema).min(2).max(4),
  final_urls: z.array(z.string().url()).min(1),
  path1: z.string().max(15).optional(),
  path2: z.string().max(15).optional(),
});

export const updateAdSchema = createAdSchema.partial().extend({
  status: z.enum(['draft', 'pending_approval', 'approved', 'active', 'paused', 'removed']).optional(),
});

// ============================================================
// Keyword Schemas
// ============================================================

export const matchTypeSchema = z.enum(['BROAD', 'PHRASE', 'EXACT']);

export const createKeywordSchema = z.object({
  ad_group_id: z.string().uuid(),
  text: z.string().min(1).max(80),
  match_type: matchTypeSchema.default('BROAD'),
  cpc_bid_micros: z.number().int().min(0).optional(),
});

export const updateKeywordSchema = createKeywordSchema.partial().extend({
  status: z.enum(['draft', 'pending_approval', 'approved', 'active', 'paused', 'removed']).optional(),
});

export const createNegativeKeywordSchema = z.object({
  campaign_id: z.string().uuid().optional(),
  ad_group_id: z.string().uuid().optional(),
  text: z.string().min(1).max(80),
  match_type: matchTypeSchema.default('PHRASE'),
  level: z.enum(['campaign', 'ad_group']),
}).refine(
  (data) => {
    if (data.level === 'campaign') return !!data.campaign_id;
    if (data.level === 'ad_group') return !!data.ad_group_id;
    return false;
  },
  { message: 'Must provide campaign_id for campaign-level or ad_group_id for ad_group-level negative keywords' }
);
