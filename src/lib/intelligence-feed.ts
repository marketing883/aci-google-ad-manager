import { createAdminClient } from './supabase-server';
import { createLogger } from './utils/logger';
import { generateCrossInsights } from './cross-insights';
import type { FeedItem, IntelligenceFeedResponse } from '@/types/intelligence';

const logger = createLogger('IntelligenceFeed');

// ============================================================
// Intelligence Feed Generator
// Aggregates feed items from ALL data sources into a single
// prioritized feed. All deterministic — zero LLM calls.
// ============================================================

// 5-minute server-side cache
let cachedResponse: IntelligenceFeedResponse | null = null;
let cacheExpires = 0;

// ---- Performance Alerts ----
async function generatePerformanceAlerts(supabase: ReturnType<typeof createAdminClient>): Promise<FeedItem[]> {
  const items: FeedItem[] = [];
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get today vs yesterday performance per campaign
  const { data: campaigns } = await supabase
    .from('campaigns').select('id, name, status, budget_amount_micros').eq('status', 'active');

  const { data: todayPerf } = await supabase
    .from('performance_snapshots').select('entity_id, cost_micros, conversions, clicks, impressions')
    .eq('entity_type', 'campaign').eq('date', today);

  const { data: yesterdayPerf } = await supabase
    .from('performance_snapshots').select('entity_id, cost_micros, conversions, clicks, impressions')
    .eq('entity_type', 'campaign').eq('date', yesterday);

  if (!campaigns) return items;

  const todayMap = new Map((todayPerf || []).map((r) => [r.entity_id, r]));
  const yesterdayMap = new Map((yesterdayPerf || []).map((r) => [r.entity_id, r]));

  for (const camp of campaigns) {
    const t = todayMap.get(camp.id);
    const y = yesterdayMap.get(camp.id);

    // Spend with 0 conversions today, had conversions yesterday
    if (t && t.cost_micros > 5_000_000 && t.conversions === 0 && y && y.conversions > 0) {
      items.push({
        id: `perf-no-conv-${camp.id}`,
        type: 'performance_alert',
        severity: 'critical',
        title: `${camp.name}: spending with zero conversions`,
        story: `Spent $${(t.cost_micros / 1_000_000).toFixed(2)} today with 0 conversions. Yesterday had ${y.conversions} conversions. Something may have changed.`,
        dataSources: ['google_ads'],
        actions: [
          { label: 'Investigate', type: 'chat', chatPrefill: `Campaign "${camp.name}" has 0 conversions today but had ${y.conversions} yesterday. What happened?` },
          { label: 'View Campaign', type: 'navigate', href: `/portfolio/${camp.id}` },
        ],
        dataPoints: { campaign: camp.name, today_spend: t.cost_micros, today_conv: 0, yesterday_conv: y.conversions },
        priority: 1,
        timestamp: new Date().toISOString(),
      });
    }

    // CPA spike (> 2x yesterday)
    if (t && y && t.conversions > 0 && y.conversions > 0) {
      const todayCpa = t.cost_micros / t.conversions;
      const yesterdayCpa = y.cost_micros / y.conversions;
      if (yesterdayCpa > 0 && todayCpa / yesterdayCpa >= 2) {
        items.push({
          id: `perf-cpa-spike-${camp.id}`,
          type: 'performance_alert',
          severity: 'warning',
          title: `${camp.name}: CPA doubled`,
          story: `CPA went from $${(yesterdayCpa / 1_000_000).toFixed(2)} yesterday to $${(todayCpa / 1_000_000).toFixed(2)} today. Costs are rising.`,
          dataSources: ['google_ads'],
          actions: [
            { label: 'Investigate', type: 'chat', chatPrefill: `Campaign "${camp.name}" CPA doubled from $${(yesterdayCpa / 1_000_000).toFixed(2)} to $${(todayCpa / 1_000_000).toFixed(2)}. Why?` },
          ],
          dataPoints: { campaign: camp.name, today_cpa: todayCpa, yesterday_cpa: yesterdayCpa },
          priority: 2,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return items;
}

// ---- Pending Approvals ----
async function generateApprovalItems(supabase: ReturnType<typeof createAdminClient>): Promise<FeedItem[]> {
  const { data: pending } = await supabase
    .from('approval_queue')
    .select('id, action_type, entity_type, ai_reasoning, priority, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  return (pending || []).map((a) => ({
    id: `approval-${a.id}`,
    type: 'pending_approval' as const,
    severity: a.priority === 'urgent' ? 'critical' as const : a.priority === 'high' ? 'warning' as const : 'info' as const,
    title: `Pending: ${a.action_type.replace(/_/g, ' ')}`,
    story: a.ai_reasoning?.slice(0, 150) || `${a.entity_type} ${a.action_type.replace(/_/g, ' ')} awaiting your review.`,
    dataSources: ['system' as const],
    actions: [
      { label: 'Review', type: 'navigate' as const, href: `/approvals/${a.id}` },
    ],
    dataPoints: { approval_id: a.id, action: a.action_type },
    priority: a.priority === 'urgent' ? 1 : a.priority === 'high' ? 2 : 3,
    timestamp: a.created_at,
  }));
}

// ---- System Events ----
async function generateSystemEvents(supabase: ReturnType<typeof createAdminClient>): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // Check last sync
  const { data: account } = await supabase
    .from('google_ads_accounts')
    .select('last_synced_at')
    .eq('is_active', true)
    .single();

  if (account?.last_synced_at) {
    const syncAge = Date.now() - new Date(account.last_synced_at).getTime();
    if (syncAge < 60 * 60 * 1000) { // Synced in last hour
      items.push({
        id: `system-sync-${account.last_synced_at}`,
        type: 'system_event',
        severity: 'success',
        title: 'Performance data synced',
        story: `Google Ads data synced successfully.`,
        dataSources: ['system'],
        actions: [],
        dataPoints: { synced_at: account.last_synced_at },
        priority: 5,
        timestamp: account.last_synced_at,
      });
    }
  }

  return items;
}

// ---- Dashboard Stats ----
async function getDashboardStats(supabase: ReturnType<typeof createAdminClient>): Promise<IntelligenceFeedResponse['stats']> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: perf } = await supabase
    .from('performance_snapshots')
    .select('cost_micros, conversions, clicks, impressions')
    .eq('entity_type', 'campaign')
    .gte('date', thirtyDaysAgo);

  const stats = (perf || []).reduce(
    (acc, row) => ({
      spend_micros: acc.spend_micros + (row.cost_micros || 0),
      conversions: acc.conversions + (row.conversions || 0),
      clicks: acc.clicks + (row.clicks || 0),
      impressions: acc.impressions + (row.impressions || 0),
    }),
    { spend_micros: 0, conversions: 0, clicks: 0, impressions: 0 },
  );

  return {
    ...stats,
    cpa_micros: stats.conversions > 0 ? Math.round(stats.spend_micros / stats.conversions) : 0,
  };
}

// ============================================================
// Main Entry Point
// ============================================================

export async function generateIntelligenceFeed(): Promise<IntelligenceFeedResponse> {
  // Check cache
  if (cachedResponse && Date.now() < cacheExpires) {
    return cachedResponse;
  }

  const supabase = createAdminClient();

  try {
    // Generate all feed items in parallel
    const [perfAlerts, crossInsights, approvalItems, systemEvents, stats] = await Promise.all([
      generatePerformanceAlerts(supabase),
      generateCrossInsights(),
      generateApprovalItems(supabase),
      generateSystemEvents(supabase),
      getDashboardStats(supabase),
    ]);

    const allItems: FeedItem[] = [...perfAlerts, ...crossInsights, ...approvalItems, ...systemEvents];

    // Sort: severity (critical first) → priority (1 first) → timestamp (newest first)
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
    allItems.sort((a, b) => {
      const sevDiff = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
      if (sevDiff !== 0) return sevDiff;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Cap at 15 items — show the most important, not everything
    const response: IntelligenceFeedResponse = {
      items: allItems.slice(0, 15),
      stats,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 5 minutes
    cachedResponse = response;
    cacheExpires = Date.now() + 5 * 60 * 1000;

    logger.info(`Intelligence feed: ${allItems.length} items (${perfAlerts.length} perf, ${crossInsights.length} cross, ${approvalItems.length} approvals, ${systemEvents.length} system)`);

    return response;
  } catch (error) {
    logger.error('Intelligence feed generation failed', { error: (error as Error).message });
    return {
      items: [],
      stats: { spend_micros: 0, conversions: 0, cpa_micros: 0, clicks: 0, impressions: 0 },
      generatedAt: new Date().toISOString(),
    };
  }
}
