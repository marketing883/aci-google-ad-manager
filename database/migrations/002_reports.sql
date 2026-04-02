-- ============================================================
-- Migration 002: Report Schedules + Generated Reports
-- ============================================================

-- Report schedules (for automated email reports)
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  recipients JSONB NOT NULL DEFAULT '[]'::jsonb, -- ["habib@aciinfotech.net", "team@aciinfotech.net"]
  frequency TEXT NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly
  day_of_week INTEGER, -- 1=Monday, 7=Sunday (for weekly)
  time_of_day TEXT DEFAULT '09:00', -- HH:MM local time
  report_type TEXT NOT NULL DEFAULT 'performance', -- performance, competitor, briefing, custom
  include_sections JSONB DEFAULT '["metrics", "recommendations"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated reports (cached, shareable)
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type TEXT NOT NULL,
  period TEXT NOT NULL, -- today, week, month, custom
  content JSONB NOT NULL, -- full report data
  html_content TEXT, -- rendered HTML for email
  share_token TEXT UNIQUE, -- for shareable links
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_active ON report_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_generated_reports_token ON generated_reports(share_token);

-- RLS
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated access" ON report_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON generated_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
