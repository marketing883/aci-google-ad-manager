// ============================================================
// Database types matching Supabase schema
// ============================================================

export type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'ended' | 'removed';
export type CampaignType = 'SEARCH' | 'DISPLAY' | 'SHOPPING' | 'VIDEO' | 'PERFORMANCE_MAX' | 'DEMAND_GEN' | 'APP';
export type BiddingStrategyType = 'MANUAL_CPC' | 'MAXIMIZE_CLICKS' | 'MAXIMIZE_CONVERSIONS' | 'TARGET_CPA' | 'TARGET_ROAS' | 'MAXIMIZE_CONVERSION_VALUE' | 'TARGET_IMPRESSION_SHARE';
export type AdGroupStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'removed';
export type AdStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'removed';
export type AdType = 'RESPONSIVE_SEARCH' | 'RESPONSIVE_DISPLAY' | 'CALL_AD' | 'EXPANDED_TEXT';
export type KeywordStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'removed';
export type MatchType = 'BROAD' | 'PHRASE' | 'EXACT';
export type NegativeKeywordLevel = 'campaign' | 'ad_group';
export type EntityType = 'campaign' | 'ad_group' | 'ad' | 'keyword';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'expired' | 'failed';
export type ApprovalPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ChatRole = 'user' | 'assistant' | 'system';

// ============================================================
// Table Row Types
// ============================================================

export interface GoogleAdsAccount {
  id: string;
  customer_id: string;
  account_name: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  developer_token: string | null;
  login_customer_id: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  google_ads_account_id: string;
  google_campaign_id: string | null;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  budget_amount_micros: number;
  budget_type: string;
  bidding_strategy: BiddingStrategyType;
  target_cpa_micros: number | null;
  target_roas: number | null;
  start_date: string | null;
  end_date: string | null;
  geo_targets: GeoTarget[];
  language_targets: string[];
  audience_targets: AudienceTarget[];
  network_settings: NetworkSettings;
  ai_notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdGroup {
  id: string;
  campaign_id: string;
  google_ad_group_id: string | null;
  name: string;
  status: AdGroupStatus;
  cpc_bid_micros: number | null;
  ai_notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ad {
  id: string;
  ad_group_id: string;
  google_ad_id: string | null;
  ad_type: AdType;
  headlines: AdTextAsset[];
  descriptions: AdTextAsset[];
  final_urls: string[];
  path1: string | null;
  path2: string | null;
  status: AdStatus;
  ai_notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Keyword {
  id: string;
  ad_group_id: string;
  google_keyword_id: string | null;
  text: string;
  match_type: MatchType;
  cpc_bid_micros: number | null;
  status: KeywordStatus;
  quality_score: number | null;
  ai_notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NegativeKeyword {
  id: string;
  campaign_id: string | null;
  ad_group_id: string | null;
  text: string;
  match_type: MatchType;
  level: NegativeKeywordLevel;
  created_at: string;
}

export interface PerformanceSnapshot {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  google_entity_id: string | null;
  date: string;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  conversion_value_micros: number;
  ctr: number | null;
  avg_cpc_micros: number | null;
  quality_score: number | null;
  search_impression_share: number | null;
  created_at: string;
}

export interface ApprovalQueueItem {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  previous_state: Record<string, unknown> | null;
  status: ApprovalStatus;
  ai_reasoning: string | null;
  confidence_score: number | null;
  priority: ApprovalPriority;
  agent_name: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  applied_at: string | null;
  error_message: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentLog {
  id: string;
  agent_name: string;
  action: string;
  input_summary: string | null;
  output_summary: string | null;
  model_used: string | null;
  tokens_used: { input: number; output: number };
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  metadata: Record<string, unknown>;
  related_approval_ids: string[];
  created_at: string;
}

export interface KeywordResearch {
  id: string;
  query: string;
  results: KeywordResearchResults;
  source: string;
  expires_at: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: unknown;
  updated_at: string;
}

export interface CompetitorData {
  id: string;
  domain: string;
  company_name: string | null;
  observed_keywords: ObservedKeyword[];
  observed_ads: ObservedAd[];
  auction_insights: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// JSONB Sub-types
// ============================================================

export interface GeoTarget {
  country?: string;
  region?: string;
  city?: string;
  radius_miles?: number;
  location_id?: string;
}

export interface AudienceTarget {
  type: 'in_market' | 'affinity' | 'custom' | 'remarketing';
  id: string;
  name?: string;
}

export interface NetworkSettings {
  search: boolean;
  display: boolean;
  partners: boolean;
}

export interface AdTextAsset {
  text: string;
  pinned_position?: number | null;
}

export interface KeywordResearchResults {
  keywords: ResearchedKeyword[];
  audience_segments?: AudienceSegment[];
  negative_suggestions?: string[];
  competitor_observations?: CompetitorObservation[];
}

export interface ResearchedKeyword {
  text: string;
  avg_monthly_searches: number | null;
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  suggested_bid_micros: number | null;
  relevance_score?: number;
}

export interface AudienceSegment {
  name: string;
  type: string;
  description?: string;
}

export interface CompetitorObservation {
  domain: string;
  observed_keywords?: string[];
  ad_copy_themes?: string[];
}

export interface ObservedKeyword {
  text: string;
  first_seen?: string;
  last_seen?: string;
}

export interface ObservedAd {
  headline?: string;
  description?: string;
  final_url?: string;
  first_seen?: string;
}

// ============================================================
// Dashboard / Aggregated Types
// ============================================================

export interface DashboardMetrics {
  total_spend_micros: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc_micros: number;
  avg_cpa_micros: number | null;
  active_campaigns: number;
  pending_approvals: number;
}

export interface CampaignWithStats extends Campaign {
  stats?: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
  };
  ad_groups_count?: number;
}

export interface ApprovalWithContext extends ApprovalQueueItem {
  campaign_name?: string;
  ad_group_name?: string;
}
