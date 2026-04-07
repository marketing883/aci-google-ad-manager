import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import {
  getTrafficOverview, getLandingPagePerformance, getAcquisitionChannels,
  getAdTrafficBehavior, getDeviceBreakdown, getConversionEvents,
} from '@/lib/google-analytics/client';
import {
  scoreWebsiteHealth, selectRecommendations,
} from '@/lib/visibility-recommendations';

// POST /api/cron/analytics-snapshot
// Runs daily — pulls GA4 data, scores health, stores snapshot
export async function POST(request: NextRequest) {
  // Verify cron secret (skip in dev)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const days = 30;
    const periodEnd = new Date().toISOString().split('T')[0];
    const periodStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Pull all GA4 data in parallel
    const [traffic, landingPages, acquisition, adTraffic, devices, conversions] = await Promise.all([
      getTrafficOverview(days),
      getLandingPagePerformance(days, 20),
      getAcquisitionChannels(days),
      getAdTrafficBehavior(days),
      getDeviceBreakdown(days),
      getConversionEvents(days),
    ]);

    // Run deterministic analysis (no LLM)
    const healthResult = scoreWebsiteHealth(traffic, landingPages, devices);
    const recommendations = selectRecommendations(healthResult.flags);

    // Pull Google Ads performance data from local snapshots
    const supabase = createAdminClient();
    const { data: adPerformance } = await supabase
      .from('performance_snapshots')
      .select('entity_id, impressions, clicks, cost_micros, conversions')
      .eq('entity_type', 'campaign')
      .gte('date', periodStart);

    const adsSummary = {
      total_spend: (adPerformance || []).reduce((s, r) => s + (r.cost_micros || 0), 0),
      total_clicks: (adPerformance || []).reduce((s, r) => s + (r.clicks || 0), 0),
      total_conversions: (adPerformance || []).reduce((s, r) => s + (r.conversions || 0), 0),
      total_impressions: (adPerformance || []).reduce((s, r) => s + (r.impressions || 0), 0),
    };

    // Store snapshot (upsert — one per day)
    const { error } = await supabase
      .from('analytics_snapshots')
      .upsert({
        period_start: periodStart,
        period_end: periodEnd,
        traffic: traffic || {},
        landing_pages: landingPages,
        acquisition: acquisition,
        conversions: { events: conversions, ad_summary: adsSummary },
        ad_traffic: adTraffic,
        device_split: devices,
        flags: healthResult.flags,
        recommendations: recommendations.map((r) => ({
          id: r.recommendation.id,
          title: r.recommendation.title,
          action: r.recommendation.action,
          category: r.recommendation.category,
          impact: r.recommendation.impact,
          priority: r.priority,
          data: r.data,
        })),
        scores: {
          website_health: healthResult.score,
          has_ga4_data: !!traffic,
          has_ads_data: (adPerformance || []).length > 0,
        },
      }, { onConflict: 'period_start,period_end' });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      website_health_score: healthResult.score,
      flags_count: healthResult.flags.length,
      recommendations_count: recommendations.length,
      has_ga4: !!traffic,
      has_ads: (adPerformance || []).length > 0,
      snapshot_date: periodEnd,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Snapshot failed' },
      { status: 500 },
    );
  }
}

// Also allow GET for manual testing
export async function GET(request: NextRequest) {
  return POST(request);
}
