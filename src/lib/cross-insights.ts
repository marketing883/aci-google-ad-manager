import { createAdminClient } from './supabase-server';
import { createLogger } from './utils/logger';
import { RECOMMENDATION_CATALOG, THRESHOLDS } from './visibility-recommendations';
import type { CrossInsight, FeedAction } from '@/types/intelligence';

const logger = createLogger('CrossInsights');

// ============================================================
// Cross-Data Insights Engine
// ALL deterministic — zero LLM calls.
// Cross-references Google Ads + GA4 + SERP data to find compound insights.
// ============================================================

function makeInsight(
  pattern: string,
  title: string,
  story: string,
  recId: string,
  severity: CrossInsight['severity'],
  dataSources: CrossInsight['dataSources'],
  dataPoints: Record<string, unknown>,
  actions: FeedAction[],
  priority: number = 2,
): CrossInsight {
  return {
    id: `insight-${pattern}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'cross_data_insight',
    severity,
    title,
    story,
    dataSources,
    actions,
    dataPoints,
    priority,
    timestamp: new Date().toISOString(),
    pattern,
    recommendationId: recId,
  };
}

// ---- Detector 1: High Spend + High Bounce ----
async function detectHighSpendBounce(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  // Get campaigns with spend
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, google_campaign_id')
    .eq('status', 'active');

  // Get latest analytics snapshot with landing page data
  const { data: snapshot } = await supabase
    .from('analytics_snapshots')
    .select('ad_traffic')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!snapshot?.ad_traffic || !campaigns?.length) return insights;

  const adPages = (snapshot.ad_traffic as Array<{ page: string; sessions: number; bounce_rate: number; conversions: number }>) || [];

  for (const page of adPages) {
    if (page.sessions >= 30 && page.bounce_rate >= THRESHOLDS.bounce_rate.critical && page.conversions === 0) {
      insights.push(makeInsight(
        'high_spend_bounce',
        'Paying for clicks that bounce',
        `Your ad traffic to ${page.page} has a ${(page.bounce_rate * 100).toFixed(0)}% bounce rate across ${page.sessions} sessions with 0 conversions. You're spending money sending people to a page they leave immediately.`,
        'fix_ad_page_mismatch',
        'critical',
        ['google_ads', 'ga4'],
        { page: page.page, bounce_rate: page.bounce_rate, sessions: page.sessions },
        [
          { label: 'Investigate', type: 'chat', chatPrefill: `The landing page ${page.page} has ${(page.bounce_rate * 100).toFixed(0)}% bounce rate from ad traffic. Help me fix this.` },
          { label: 'View Analytics', type: 'navigate', href: '/visibility/analytics' },
        ],
        1,
      ));
    }
  }

  return insights;
}

// ---- Detector 2: Organic Rank Top-3 + Paid Bid ----
async function detectOrganicPaidOverlap(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  // Get latest visibility report
  const { data: report } = await supabase
    .from('brand_visibility_reports')
    .select('organic_results, paid_results, domain')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!report) return insights;

  const organicResults = (report.organic_results as Array<{ keyword: string; brand_position: number | null }>) || [];
  const paidResults = (report.paid_results as Array<{ keyword: string; brand_ad: number | null }>) || [];

  for (const org of organicResults) {
    if (org.brand_position && org.brand_position <= 3) {
      const paid = paidResults.find((p) => p.keyword === org.keyword && p.brand_ad);
      if (paid) {
        insights.push(makeInsight(
          'organic_paid_overlap',
          'Double-paying on a keyword you already rank for',
          `You rank #${org.brand_position} organically for "${org.keyword}" but you're also paying for ads (position #${paid.brand_ad}). Consider reducing paid spend — your organic listing may capture most of this traffic for free.`,
          'reduce_paid_organic_overlap',
          'info',
          ['google_ads', 'serp'],
          { keyword: org.keyword, organic_position: org.brand_position, paid_position: paid.brand_ad },
          [
            { label: 'Review in Chat', type: 'chat', chatPrefill: `I rank #${org.brand_position} organically for "${org.keyword}" but also bid on it. Should I reduce paid spend?` },
          ],
          3,
        ));
      }
    }
  }

  return insights;
}

// ---- Detector 3: Budget-Limited Winner ----
async function detectBudgetLimitedWinner(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, budget_amount_micros, status')
    .eq('status', 'active');

  const { data: perf } = await supabase
    .from('performance_snapshots')
    .select('entity_id, cost_micros, conversions')
    .eq('entity_type', 'campaign')
    .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  if (!campaigns?.length || !perf?.length) return insights;

  const perfMap = new Map<string, { spend: number; conv: number }>();
  for (const row of perf) {
    const existing = perfMap.get(row.entity_id) || { spend: 0, conv: 0 };
    perfMap.set(row.entity_id, { spend: existing.spend + row.cost_micros, conv: existing.conv + row.conversions });
  }

  for (const camp of campaigns) {
    const p = perfMap.get(camp.id);
    if (!p || p.conv === 0) continue;

    // Check if campaign is spending > 85% of weekly budget
    const weeklyBudget = camp.budget_amount_micros * 7;
    if (weeklyBudget > 0 && p.spend / weeklyBudget > 0.85) {
      const cpa = p.spend / p.conv;
      insights.push(makeInsight(
        'budget_limited_winner',
        `"${camp.name}" is budget-limited`,
        `Campaign "${camp.name}" converts at $${(cpa / 1_000_000).toFixed(2)} CPA with ${p.conv} conversions this week, but it's spending ${Math.round(p.spend / weeklyBudget * 100)}% of its budget. Increasing budget could capture more conversions.`,
        'increase_budget_winner',
        'warning',
        ['google_ads'],
        { campaign: camp.name, cpa, conversions: p.conv, utilization: p.spend / weeklyBudget },
        [
          { label: 'Increase Budget', type: 'chat', chatPrefill: `Increase the daily budget for campaign "${camp.name}" — it's budget-limited but converting well.` },
          { label: 'View Campaign', type: 'navigate', href: `/portfolio/${camp.id}` },
        ],
        2,
      ));
    }
  }

  return insights;
}

// ---- Detector 4: High-Converting Page Gets No Paid Traffic ----
async function detectUnusedConvertingPage(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  const { data: snapshot } = await supabase
    .from('analytics_snapshots')
    .select('landing_pages, ad_traffic')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!snapshot) return insights;

  const allPages = (snapshot.landing_pages as Array<{ page: string; sessions: number; conversion_rate: number; conversions: number }>) || [];
  const adPages = (snapshot.ad_traffic as Array<{ page: string; sessions: number }>) || [];
  const adPageSet = new Set(adPages.map((p) => p.page));

  for (const page of allPages) {
    if (page.sessions >= 50 && page.conversion_rate >= THRESHOLDS.conversion_rate.industry_avg && !adPageSet.has(page.page)) {
      insights.push(makeInsight(
        'unused_converting_page',
        'Best converting page gets no ad traffic',
        `${page.page} converts at ${(page.conversion_rate * 100).toFixed(1)}% (${page.conversions} conversions from ${page.sessions} sessions) but receives no paid traffic. Sending ads to this page could improve ROI.`,
        'send_traffic_to_converter',
        'warning',
        ['ga4', 'google_ads'],
        { page: page.page, conversion_rate: page.conversion_rate, sessions: page.sessions },
        [
          { label: 'Create Ad Group', type: 'chat', chatPrefill: `Create an ad group pointing to ${page.page} — it has a ${(page.conversion_rate * 100).toFixed(1)}% conversion rate but no paid traffic.` },
        ],
        2,
      ));
    }
  }

  return insights;
}

// ---- Detector 5: New Competitor ----
async function detectNewCompetitor(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: newCompetitors } = await supabase
    .from('competitor_data')
    .select('domain, company_name, notes')
    .gte('created_at', sevenDaysAgo);

  for (const comp of newCompetitors || []) {
    insights.push(makeInsight(
      'new_competitor',
      `New competitor detected: ${comp.company_name || comp.domain}`,
      `${comp.company_name || comp.domain} was found ranking for your keywords${comp.notes ? ` (${comp.notes})` : ''}. Consider monitoring their strategy.`,
      'competitor_dominates',
      'info',
      ['serp'],
      { domain: comp.domain, company: comp.company_name },
      [
        { label: 'Analyze', type: 'chat', chatPrefill: `Analyze competitor ${comp.company_name || comp.domain} — what keywords are they targeting and how should we respond?` },
        { label: 'View Intelligence', type: 'navigate', href: '/intelligence' },
      ],
      3,
    ));
  }

  return insights;
}

// ---- Detector 6: Visibility Score Drop ----
async function detectVisibilityDrop(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  const { data: reports } = await supabase
    .from('brand_visibility_reports')
    .select('overall_score, organic_score, ai_overview_score, paid_score, created_at')
    .order('created_at', { ascending: false })
    .limit(2);

  if (!reports || reports.length < 2) return insights;

  const [latest, previous] = reports;
  const drop = previous.overall_score - latest.overall_score;

  if (drop >= 10) {
    const changes: string[] = [];
    if (latest.organic_score < previous.organic_score) changes.push(`organic ${previous.organic_score}→${latest.organic_score}`);
    if (latest.ai_overview_score < previous.ai_overview_score) changes.push(`AI overview ${previous.ai_overview_score}→${latest.ai_overview_score}`);
    if (latest.paid_score < previous.paid_score) changes.push(`paid ${previous.paid_score}→${latest.paid_score}`);

    insights.push(makeInsight(
      'visibility_drop',
      `Visibility score dropped by ${drop} points`,
      `Your overall visibility score dropped from ${previous.overall_score} to ${latest.overall_score}. Changes: ${changes.join(', ') || 'across multiple areas'}.`,
      'visibility_dropped',
      'warning',
      ['serp', 'llm'],
      { previous_score: previous.overall_score, current_score: latest.overall_score, drop },
      [
        { label: 'View Report', type: 'navigate', href: '/visibility/search' },
        { label: 'Investigate', type: 'chat', chatPrefill: `My visibility score dropped from ${previous.overall_score} to ${latest.overall_score}. What changed and what should I do?` },
      ],
      1,
    ));
  }

  return insights;
}

// ---- Detector 7: Mobile Gap ----
async function detectMobileGap(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  const { data: snapshot } = await supabase
    .from('analytics_snapshots')
    .select('device_split')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!snapshot?.device_split) return insights;

  const devices = snapshot.device_split as Array<{ device: string; sessions: number; conversion_rate: number; bounce_rate: number }>;
  const mobile = devices.find((d) => d.device === 'mobile');
  const desktop = devices.find((d) => d.device === 'desktop');

  if (mobile && desktop && desktop.conversion_rate > 0 && mobile.sessions >= 50) {
    const gap = desktop.conversion_rate / (mobile.conversion_rate || 0.001);
    if (gap >= THRESHOLDS.mobile_gap.warning) {
      insights.push(makeInsight(
        'mobile_gap',
        'Mobile experience is hurting conversions',
        `Mobile converts at ${(mobile.conversion_rate * 100).toFixed(1)}% vs desktop at ${(desktop.conversion_rate * 100).toFixed(1)}% — ${gap.toFixed(1)}x worse. With ${mobile.sessions} mobile sessions, fixing mobile could unlock significant conversions.`,
        'fix_mobile',
        'warning',
        ['ga4'],
        { mobile_rate: mobile.conversion_rate, desktop_rate: desktop.conversion_rate, gap, mobile_sessions: mobile.sessions },
        [
          { label: 'Investigate', type: 'chat', chatPrefill: `Mobile converts ${gap.toFixed(1)}x worse than desktop. What should I fix first?` },
          { label: 'View Devices', type: 'navigate', href: '/visibility/analytics' },
        ],
        2,
      ));
    }
  }

  return insights;
}

// ---- Detector 8: Traffic Quality ----
async function detectTrafficQuality(supabase: ReturnType<typeof createAdminClient>): Promise<CrossInsight[]> {
  const insights: CrossInsight[] = [];

  const { data: snapshots } = await supabase
    .from('analytics_snapshots')
    .select('traffic, conversions, period_start')
    .order('created_at', { ascending: false })
    .limit(2);

  if (!snapshots || snapshots.length < 2) return insights;

  const [current, previous] = snapshots;
  const curTraffic = (current.traffic as { sessions?: number })?.sessions || 0;
  const prevTraffic = (previous.traffic as { sessions?: number })?.sessions || 0;
  const curConv = (current.conversions as { events?: Array<{ count: number }> })?.events?.reduce((s, e) => s + e.count, 0) || 0;
  const prevConv = (previous.conversions as { events?: Array<{ count: number }> })?.events?.reduce((s, e) => s + e.count, 0) || 0;

  if (prevTraffic > 0 && curTraffic / prevTraffic >= 1.2 && curConv <= prevConv && curTraffic >= 100) {
    insights.push(makeInsight(
      'traffic_quality',
      'Traffic up but conversions flat',
      `Sessions increased ${Math.round((curTraffic / prevTraffic - 1) * 100)}% (${prevTraffic}→${curTraffic}) but conversions didn't follow (${prevConv}→${curConv}). This could indicate low-quality traffic or tracking issues.`,
      'traffic_up_conversions_down',
      'warning',
      ['ga4'],
      { current_sessions: curTraffic, previous_sessions: prevTraffic, current_conv: curConv, previous_conv: prevConv },
      [
        { label: 'Investigate', type: 'chat', chatPrefill: `Traffic is up ${Math.round((curTraffic / prevTraffic - 1) * 100)}% but conversions are flat. Help me figure out why.` },
      ],
      2,
    ));
  }

  return insights;
}

// ============================================================
// Main Entry Point
// ============================================================

export async function generateCrossInsights(): Promise<CrossInsight[]> {
  const supabase = createAdminClient();

  try {
    const results = await Promise.all([
      detectHighSpendBounce(supabase),
      detectOrganicPaidOverlap(supabase),
      detectBudgetLimitedWinner(supabase),
      detectUnusedConvertingPage(supabase),
      detectNewCompetitor(supabase),
      detectVisibilityDrop(supabase),
      detectMobileGap(supabase),
      detectTrafficQuality(supabase),
    ]);

    const allInsights = results.flat();
    // Sort by priority (1 = highest) then severity
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
    allInsights.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
    });

    logger.info(`Generated ${allInsights.length} cross-data insights`);
    return allInsights;
  } catch (error) {
    logger.error('Cross-insights generation failed', { error: (error as Error).message });
    return [];
  }
}
