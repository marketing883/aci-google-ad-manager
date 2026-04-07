-- ============================================================
-- ACI Ads Manager - Complete Database Schema
-- Supabase PostgreSQL
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. Google Ads Accounts
-- ============================================================
CREATE TABLE google_ads_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id TEXT NOT NULL, -- format: xxx-xxx-xxxx
  account_name TEXT NOT NULL,
  access_token TEXT, -- encrypted at app layer
  refresh_token TEXT, -- encrypted at app layer
  token_expires_at TIMESTAMPTZ,
  developer_token TEXT, -- encrypted at app layer
  login_customer_id TEXT, -- MCC account ID if applicable
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. Campaigns
-- ============================================================
CREATE TYPE campaign_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'active', 'paused', 'ended', 'removed'
);

CREATE TYPE campaign_type AS ENUM (
  'SEARCH', 'DISPLAY', 'SHOPPING', 'VIDEO', 'PERFORMANCE_MAX', 'DEMAND_GEN', 'APP'
);

CREATE TYPE bidding_strategy_type AS ENUM (
  'MANUAL_CPC', 'MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA',
  'TARGET_ROAS', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_IMPRESSION_SHARE'
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  google_ads_account_id UUID NOT NULL REFERENCES google_ads_accounts(id) ON DELETE CASCADE,
  google_campaign_id TEXT, -- null until pushed to Google Ads
  name TEXT NOT NULL,
  campaign_type campaign_type NOT NULL DEFAULT 'SEARCH',
  status campaign_status NOT NULL DEFAULT 'draft',
  budget_amount_micros BIGINT NOT NULL DEFAULT 0, -- in micros (1,000,000 = $1)
  budget_type TEXT NOT NULL DEFAULT 'DAILY',
  bidding_strategy bidding_strategy_type NOT NULL DEFAULT 'MAXIMIZE_CLICKS',
  target_cpa_micros BIGINT,
  target_roas NUMERIC(5,2),
  start_date DATE,
  end_date DATE,
  geo_targets JSONB DEFAULT '[]'::jsonb, -- [{country: "US", radius_miles: null}]
  language_targets JSONB DEFAULT '[]'::jsonb, -- ["en", "ar"]
  audience_targets JSONB DEFAULT '[]'::jsonb, -- [{type: "in_market", id: "..."}]
  network_settings JSONB DEFAULT '{}'::jsonb, -- {search: true, display: false, partners: false}
  ai_notes TEXT, -- agent reasoning/context
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_account ON campaigns(google_ads_account_id);

-- ============================================================
-- 3. Ad Groups
-- ============================================================
CREATE TYPE ad_group_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'active', 'paused', 'removed'
);

CREATE TABLE ad_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  google_ad_group_id TEXT,
  name TEXT NOT NULL,
  status ad_group_status NOT NULL DEFAULT 'draft',
  cpc_bid_micros BIGINT, -- default CPC bid for this ad group
  ai_notes TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_groups_campaign ON ad_groups(campaign_id);

-- ============================================================
-- 4. Ads
-- ============================================================
CREATE TYPE ad_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'active', 'paused', 'removed'
);

CREATE TYPE ad_type AS ENUM (
  'RESPONSIVE_SEARCH', 'RESPONSIVE_DISPLAY', 'CALL_AD', 'EXPANDED_TEXT'
);

CREATE TABLE ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_group_id UUID NOT NULL REFERENCES ad_groups(id) ON DELETE CASCADE,
  google_ad_id TEXT,
  ad_type ad_type NOT NULL DEFAULT 'RESPONSIVE_SEARCH',
  headlines JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{text: "...", pinned_position: null}]
  descriptions JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{text: "...", pinned_position: null}]
  final_urls JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["https://example.com"]
  path1 TEXT, -- display URL path 1 (max 15 chars)
  path2 TEXT, -- display URL path 2 (max 15 chars)
  status ad_status NOT NULL DEFAULT 'draft',
  ai_notes TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ads_ad_group ON ads(ad_group_id);

-- ============================================================
-- 5. Keywords
-- ============================================================
CREATE TYPE keyword_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'active', 'paused', 'removed'
);

CREATE TYPE match_type AS ENUM ('BROAD', 'PHRASE', 'EXACT');

CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_group_id UUID NOT NULL REFERENCES ad_groups(id) ON DELETE CASCADE,
  google_keyword_id TEXT,
  text TEXT NOT NULL,
  match_type match_type NOT NULL DEFAULT 'BROAD',
  cpc_bid_micros BIGINT,
  status keyword_status NOT NULL DEFAULT 'draft',
  quality_score INTEGER, -- 1-10 from Google Ads
  ai_notes TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_keywords_ad_group ON keywords(ad_group_id);

-- ============================================================
-- 6. Negative Keywords
-- ============================================================
CREATE TYPE negative_keyword_level AS ENUM ('campaign', 'ad_group');

CREATE TABLE negative_keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  ad_group_id UUID REFERENCES ad_groups(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  match_type match_type NOT NULL DEFAULT 'PHRASE',
  level negative_keyword_level NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_negative_keyword_parent CHECK (
    (level = 'campaign' AND campaign_id IS NOT NULL AND ad_group_id IS NULL) OR
    (level = 'ad_group' AND ad_group_id IS NOT NULL)
  )
);

CREATE INDEX idx_negative_keywords_campaign ON negative_keywords(campaign_id);
CREATE INDEX idx_negative_keywords_ad_group ON negative_keywords(ad_group_id);

-- ============================================================
-- 7. Performance Snapshots (append-only time-series)
-- ============================================================
CREATE TYPE entity_type AS ENUM ('campaign', 'ad_group', 'ad', 'keyword');

CREATE TABLE performance_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  google_entity_id TEXT,
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  cost_micros BIGINT NOT NULL DEFAULT 0,
  conversions NUMERIC(10,2) NOT NULL DEFAULT 0,
  conversion_value_micros BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4), -- click-through rate
  avg_cpc_micros BIGINT,
  quality_score INTEGER,
  search_impression_share NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_performance_snapshot UNIQUE (entity_type, entity_id, date)
);

CREATE INDEX idx_performance_entity ON performance_snapshots(entity_type, entity_id, date DESC);
CREATE INDEX idx_performance_date ON performance_snapshots(date DESC);

-- ============================================================
-- 8. Approval Queue
-- ============================================================
CREATE TYPE approval_status AS ENUM (
  'pending', 'approved', 'rejected', 'applied', 'expired', 'failed'
);

CREATE TYPE approval_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE approval_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type TEXT NOT NULL, -- create_campaign, update_bid, pause_keyword, etc.
  entity_type TEXT NOT NULL, -- campaign, ad_group, ad, keyword
  entity_id UUID, -- null for new entities
  payload JSONB NOT NULL, -- full proposed change
  previous_state JSONB, -- snapshot before edit (for diff)
  status approval_status NOT NULL DEFAULT 'pending',
  ai_reasoning TEXT, -- why the agent proposed this
  confidence_score NUMERIC(3,2), -- 0.00 to 1.00
  priority approval_priority NOT NULL DEFAULT 'normal',
  agent_name TEXT, -- which agent created this
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  applied_at TIMESTAMPTZ,
  error_message TEXT, -- if apply failed
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approval_status ON approval_queue(status);
CREATE INDEX idx_approval_created ON approval_queue(created_at DESC);
CREATE INDEX idx_approval_priority ON approval_queue(priority, created_at DESC);

-- ============================================================
-- 9. Agent Logs
-- ============================================================
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  model_used TEXT,
  tokens_used JSONB DEFAULT '{}'::jsonb, -- {input: 0, output: 0}
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success', -- success, error, fallback
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_created ON agent_logs(created_at DESC);
CREATE INDEX idx_agent_logs_agent ON agent_logs(agent_name, created_at DESC);

-- ============================================================
-- 10. Chat Messages
-- ============================================================
CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role chat_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- {model: "...", tokens: {...}}
  related_approval_ids UUID[] DEFAULT '{}', -- links to generated approval items
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- ============================================================
-- 11. Keyword Research Cache
-- ============================================================
CREATE TABLE keyword_research (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query TEXT NOT NULL,
  results JSONB NOT NULL, -- full research output
  source TEXT NOT NULL DEFAULT 'google_ads_planner', -- google_ads_planner, ai_generated
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_keyword_research_query ON keyword_research(query);

-- ============================================================
-- 12. Settings (key-value store)
-- ============================================================
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('auto_approve_enabled', 'false'::jsonb),
  ('auto_approve_bid_threshold_percent', '10'::jsonb),
  ('optimizer_schedule', '"daily_8am"'::jsonb),
  ('sync_interval_hours', '6'::jsonb),
  ('default_ai_model', '"sonnet"'::jsonb),
  ('notification_email', 'null'::jsonb);

-- ============================================================
-- 13. Competitor Data
-- ============================================================
CREATE TABLE competitor_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL,
  company_name TEXT,
  observed_keywords JSONB DEFAULT '[]'::jsonb,
  observed_ads JSONB DEFAULT '[]'::jsonb,
  auction_insights JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (defense-in-depth for single-user app)
-- ============================================================
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE negative_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_data ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow authenticated users full access (single-user app)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'google_ads_accounts', 'campaigns', 'ad_groups', 'ads', 'keywords',
      'negative_keywords', 'performance_snapshots', 'approval_queue',
      'agent_logs', 'chat_messages', 'keyword_research', 'settings', 'competitor_data'
    ])
  LOOP
    EXECUTE format(
      'CREATE POLICY "Allow authenticated access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'google_ads_accounts', 'campaigns', 'ad_groups', 'ads', 'keywords',
      'approval_queue', 'settings', 'competitor_data'
    ])
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================
-- Brand Visibility & Analytics Intelligence
-- ============================================================

CREATE TABLE brand_visibility_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  target_keywords TEXT[] NOT NULL,
  competitor_domains TEXT[] DEFAULT '{}',
  overall_score INTEGER,
  organic_score INTEGER,
  ai_overview_score INTEGER,
  llm_score INTEGER,
  paid_score INTEGER,
  organic_results JSONB DEFAULT '{}',
  ai_overview_results JSONB DEFAULT '{}',
  llm_results JSONB DEFAULT '{}',
  paid_results JSONB DEFAULT '{}',
  competitor_comparison JSONB DEFAULT '{}',
  recommendations JSONB DEFAULT '[]',
  api_cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bvr_domain ON brand_visibility_reports(domain, created_at DESC);

CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  traffic JSONB DEFAULT '{}',
  landing_pages JSONB DEFAULT '[]',
  acquisition JSONB DEFAULT '{}',
  conversions JSONB DEFAULT '{}',
  ad_traffic JSONB DEFAULT '{}',
  device_split JSONB DEFAULT '{}',
  flags JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  scores JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period_start, period_end)
);

CREATE INDEX idx_analytics_period ON analytics_snapshots(period_start DESC);
