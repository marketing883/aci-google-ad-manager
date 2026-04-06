import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { updateCampaignSchema } from '@/schemas/campaign';

// GET /api/campaigns/[id] — Campaign detail with nested entities
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    // Fetch campaign
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Fetch ad groups with nested ads and keywords
    const { data: adGroups } = await supabase
      .from('ad_groups')
      .select('*')
      .eq('campaign_id', id)
      .neq('status', 'removed')
      .order('created_at');

    const adGroupIds = (adGroups || []).map((ag: { id: string }) => ag.id);

    let ads: Record<string, unknown>[] = [];
    let keywords: Record<string, unknown>[] = [];
    let negativeKeywords: Record<string, unknown>[] = [];

    if (adGroupIds.length > 0) {
      const [adsResult, kwResult, negKwResult] = await Promise.all([
        supabase.from('ads').select('*').in('ad_group_id', adGroupIds).neq('status', 'removed'),
        supabase.from('keywords').select('*').in('ad_group_id', adGroupIds).neq('status', 'removed'),
        supabase.from('negative_keywords').select('*').in('ad_group_id', adGroupIds),
      ]);

      ads = adsResult.data || [];
      keywords = kwResult.data || [];
      negativeKeywords = negKwResult.data || [];
    }

    // Also get campaign-level negative keywords
    const { data: campaignNegKws } = await supabase
      .from('negative_keywords')
      .select('*')
      .eq('campaign_id', id)
      .eq('level', 'campaign');

    // Get performance snapshots (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: performance } = await supabase
      .from('performance_snapshots')
      .select('*')
      .eq('entity_type', 'campaign')
      .eq('entity_id', id)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: true });

    // Nest ads and keywords under their ad groups
    const enrichedAdGroups = (adGroups || []).map((ag: { id: string }) => ({
      ...ag,
      ads: ads.filter((a: Record<string, unknown>) => a.ad_group_id === ag.id),
      keywords: keywords.filter((k: Record<string, unknown>) => k.ad_group_id === ag.id),
      negative_keywords: negativeKeywords.filter((nk: Record<string, unknown>) => nk.ad_group_id === ag.id),
    }));

    return NextResponse.json({
      ...campaign,
      ad_groups: enrichedAdGroups,
      negative_keywords: campaignNegKws || [],
      performance: performance || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch campaign' },
      { status: 500 },
    );
  }
}

// PATCH /api/campaigns/[id] — Update campaign
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateCampaignSchema.parse(body);

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('campaigns')
      .update(validated)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update campaign' },
      { status: 500 },
    );
  }
}

// DELETE /api/campaigns/[id] — Soft delete (default) or hard delete (?hard=true)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const hard = request.nextUrl.searchParams.get('hard') === 'true';
    const supabase = createAdminClient();

    if (hard) {
      // Hard delete — permanently remove from DB (CASCADE deletes ad_groups, ads, keywords, negative_keywords)
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } else {
      // Soft delete — set status to removed
      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'removed' })
        .eq('id', id);

      if (error) throw error;
    }

    return NextResponse.json({ success: true, hard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete campaign' },
      { status: 500 },
    );
  }
}
