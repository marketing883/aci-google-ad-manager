import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// GET /api/performance/dashboard — Aggregated dashboard metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const days = parseInt(request.nextUrl.searchParams.get('days') || '30');
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Aggregate campaign performance
    const { data: performance } = await supabase
      .from('performance_snapshots')
      .select('date, impressions, clicks, cost_micros, conversions, conversion_value_micros')
      .eq('entity_type', 'campaign')
      .gte('date', dateFrom)
      .order('date', { ascending: true });

    // Count active campaigns
    const { count: activeCampaigns } = await supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // Count pending approvals
    const { count: pendingApprovals } = await supabase
      .from('approval_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Calculate totals
    const totals = (performance || []).reduce(
      (acc, row) => ({
        total_spend_micros: acc.total_spend_micros + (row.cost_micros || 0),
        total_clicks: acc.total_clicks + (row.clicks || 0),
        total_impressions: acc.total_impressions + (row.impressions || 0),
        total_conversions: acc.total_conversions + (row.conversions || 0),
      }),
      { total_spend_micros: 0, total_clicks: 0, total_impressions: 0, total_conversions: 0 },
    );

    const avg_ctr = totals.total_impressions > 0
      ? totals.total_clicks / totals.total_impressions
      : 0;
    const avg_cpc_micros = totals.total_clicks > 0
      ? Math.round(totals.total_spend_micros / totals.total_clicks)
      : 0;
    const avg_cpa_micros = totals.total_conversions > 0
      ? Math.round(totals.total_spend_micros / totals.total_conversions)
      : null;

    // Daily breakdown for charts
    const dailyData = new Map<string, { spend: number; clicks: number; impressions: number; conversions: number }>();
    for (const row of performance || []) {
      const existing = dailyData.get(row.date) || { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
      dailyData.set(row.date, {
        spend: existing.spend + (row.cost_micros || 0),
        clicks: existing.clicks + (row.clicks || 0),
        impressions: existing.impressions + (row.impressions || 0),
        conversions: existing.conversions + (row.conversions || 0),
      });
    }

    return NextResponse.json({
      metrics: {
        ...totals,
        avg_ctr,
        avg_cpc_micros,
        avg_cpa_micros,
        active_campaigns: activeCampaigns || 0,
        pending_approvals: pendingApprovals || 0,
      },
      daily: Array.from(dailyData.entries()).map(([date, data]) => ({
        date,
        ...data,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dashboard' },
      { status: 500 },
    );
  }
}
