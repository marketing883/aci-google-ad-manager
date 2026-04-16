// ============================================================
// Google Ads API Type Definitions
// ============================================================

export interface GoogleAdsTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface GoogleAdsAccountInfo {
  customer_id: string;
  descriptive_name: string;
  currency_code: string;
  time_zone: string;
  manager: boolean;
}

export interface GoogleAdsCampaign {
  resource_name: string;
  id: string;
  name: string;
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
  advertising_channel_type: string;
  campaign_budget: string;
  bidding_strategy_type: string;
  start_date?: string;
  end_date?: string;
  target_cpa?: { target_cpa_micros: string };
  target_roas?: { target_roas: number };
  network_settings?: {
    target_google_search: boolean;
    target_search_network: boolean;
    target_content_network: boolean;
  };
}

export interface GoogleAdsAdGroup {
  resource_name: string;
  id: string;
  name: string;
  campaign: string;
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
  cpc_bid_micros?: string;
}

export interface GoogleAdsAd {
  resource_name: string;
  id: string;
  ad_group: string;
  type: string;
  responsive_search_ad?: {
    headlines: Array<{ text: string; pinned_field?: string }>;
    descriptions: Array<{ text: string; pinned_field?: string }>;
  };
  final_urls: string[];
  path1?: string;
  path2?: string;
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
}

export interface GoogleAdsKeyword {
  resource_name: string;
  id: string;
  ad_group: string;
  keyword: {
    text: string;
    match_type: 'BROAD' | 'PHRASE' | 'EXACT';
  };
  status: 'ENABLED' | 'PAUSED' | 'REMOVED';
  cpc_bid_micros?: string;
  quality_info?: {
    quality_score: number;
  };
}

export interface GoogleAdsPerformanceRow {
  campaign_id?: string;
  ad_group_id?: string;
  ad_id?: string;
  keyword_id?: string;
  date: string;
  metrics: {
    impressions: string;
    clicks: string;
    cost_micros: string;
    conversions: string;
    conversions_value: string;
    ctr: string;
    average_cpc: string;
    search_impression_share?: string;
    // Populated on keyword-level rows only — Google Ads exposes quality_score
    // on ad_group_criterion.quality_info. Stored as integer 1–10 (or null if
    // Google hasn't computed one yet, e.g. for very-low-volume keywords).
    quality_score?: number;
  };
}

export interface GoogleAdsBudget {
  resource_name: string;
  id: string;
  name: string;
  amount_micros: string;
  delivery_method: string;
}

// Keyword Planner types
export interface KeywordPlannerResult {
  text: string;
  avg_monthly_searches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED';
  low_top_of_page_bid_micros: number;
  high_top_of_page_bid_micros: number;
}

// Mutate operation types
export interface MutateOperation {
  entity_type: 'campaign' | 'ad_group' | 'ad' | 'keyword' | 'budget';
  operation: 'create' | 'update' | 'remove';
  resource?: string;
  data?: Record<string, unknown>;
}

export interface MutateResult {
  success: boolean;
  resource_name?: string;
  error?: string;
}

// Status mapping between local and Google Ads
export const STATUS_MAP = {
  toGoogle: {
    active: 'ENABLED',
    paused: 'PAUSED',
    removed: 'REMOVED',
  } as const,
  fromGoogle: {
    ENABLED: 'active',
    PAUSED: 'paused',
    REMOVED: 'removed',
  } as const,
};

// Campaign type mapping
export const CAMPAIGN_TYPE_MAP = {
  toGoogle: {
    SEARCH: 'SEARCH',
    DISPLAY: 'DISPLAY_NETWORK',
    SHOPPING: 'SHOPPING',
    VIDEO: 'VIDEO',
    PERFORMANCE_MAX: 'PERFORMANCE_MAX',
    DEMAND_GEN: 'DEMAND_GEN',
    APP: 'MULTI_CHANNEL',
  } as const,
  fromGoogle: {
    SEARCH: 'SEARCH',
    DISPLAY_NETWORK: 'DISPLAY',
    SHOPPING: 'SHOPPING',
    VIDEO: 'VIDEO',
    PERFORMANCE_MAX: 'PERFORMANCE_MAX',
    DEMAND_GEN: 'DEMAND_GEN',
    MULTI_CHANNEL: 'APP',
  } as Record<string, string>,
};

// Bidding strategy mapping
export const BIDDING_STRATEGY_MAP = {
  toGoogle: {
    MANUAL_CPC: 'MANUAL_CPC',
    MAXIMIZE_CLICKS: 'MAXIMIZE_CLICKS',
    MAXIMIZE_CONVERSIONS: 'MAXIMIZE_CONVERSIONS',
    TARGET_CPA: 'TARGET_CPA',
    TARGET_ROAS: 'TARGET_ROAS',
    MAXIMIZE_CONVERSION_VALUE: 'MAXIMIZE_CONVERSION_VALUE',
    TARGET_IMPRESSION_SHARE: 'TARGET_IMPRESSION_SHARE',
  } as const,
  fromGoogle: {
    MANUAL_CPC: 'MANUAL_CPC',
    MAXIMIZE_CLICKS: 'MAXIMIZE_CLICKS',
    MAXIMIZE_CONVERSIONS: 'MAXIMIZE_CONVERSIONS',
    TARGET_CPA: 'TARGET_CPA',
    TARGET_ROAS: 'TARGET_ROAS',
    MAXIMIZE_CONVERSION_VALUE: 'MAXIMIZE_CONVERSION_VALUE',
    TARGET_IMPRESSION_SHARE: 'TARGET_IMPRESSION_SHARE',
  } as Record<string, string>,
};
