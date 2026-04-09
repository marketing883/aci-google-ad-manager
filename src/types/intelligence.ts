// ============================================================
// Intelligence Feed + Cross-Data Insights Types
// Used by: intelligence-feed.ts, cross-insights.ts, briefing page, ChatPanel
// ============================================================

export type FeedSeverity = 'critical' | 'warning' | 'info' | 'success';

export type FeedDataSource = 'google_ads' | 'ga4' | 'serp' | 'llm' | 'system';

export type FeedItemType =
  | 'performance_alert'
  | 'competitor_move'
  | 'optimization_opportunity'
  | 'cross_data_insight'
  | 'visibility_change'
  | 'system_event'
  | 'pending_approval';

export interface FeedAction {
  label: string;
  type: 'navigate' | 'chat';
  href?: string;
  chatPrefill?: string;
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  severity: FeedSeverity;
  title: string;
  story: string;
  dataSources: FeedDataSource[];
  actions: FeedAction[];
  dataPoints: Record<string, unknown>;
  priority: number;  // 1 = highest
  timestamp: string; // ISO
}

export interface CrossInsight extends FeedItem {
  type: 'cross_data_insight';
  pattern: string;
  recommendationId: string;
}

// ============================================================
// Chat Panel Context
// Tells the AI what page/entity the user is looking at
// ============================================================

export interface ChatContext {
  page: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  summary?: string;
}

// ============================================================
// Intelligence Feed API Response
// ============================================================

export interface IntelligenceFeedResponse {
  items: FeedItem[];
  stats: {
    spend_micros: number;
    conversions: number;
    cpa_micros: number;
    clicks: number;
    impressions: number;
  };
  generatedAt: string;
}
