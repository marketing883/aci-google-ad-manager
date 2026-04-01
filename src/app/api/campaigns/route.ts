import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createCampaignSchema } from '@/schemas/campaign';

// GET /api/campaigns — List campaigns with stats
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const status = request.nextUrl.searchParams.get('status');

    let query = supabase
      .from('campaigns')
      .select('*, ad_groups(count)')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Fetch latest performance stats for each campaign
    const campaignIds = (data || []).map((c: { id: string }) => c.id);
    let stats: Record<string, { impressions: number; clicks: number; cost_micros: number; conversions: number; ctr: number }> = {};

    if (campaignIds.length > 0) {
      const { data: perfData } = await supabase
        .from('performance_snapshots')
        .select('entity_id, impressions, clicks, cost_micros, conversions, ctr')
        .eq('entity_type', 'campaign')
        .in('entity_id', campaignIds)
        .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (perfData) {
        // Aggregate by campaign
        for (const row of perfData) {
          if (!stats[row.entity_id]) {
            stats[row.entity_id] = { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0, ctr: 0 };
          }
          stats[row.entity_id].impressions += row.impressions;
          stats[row.entity_id].clicks += row.clicks;
          stats[row.entity_id].cost_micros += row.cost_micros;
          stats[row.entity_id].conversions += row.conversions;
        }
        // Calculate CTR
        for (const id of Object.keys(stats)) {
          stats[id].ctr = stats[id].impressions > 0
            ? stats[id].clicks / stats[id].impressions
            : 0;
        }
      }
    }

    const campaigns = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      stats: stats[(c as { id: string }).id] || null,
      ad_groups_count: (c as { ad_groups: Array<{ count: number }> }).ad_groups?.[0]?.count || 0,
    }));

    return NextResponse.json(campaigns);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaigns' },
      { status: 500 },
    );
  }
}

// POST /api/campaigns — Create draft campaign
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createCampaignSchema.parse(body);

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        ...validated,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create campaign' },
      { status: 500 },
    );
  }
}
