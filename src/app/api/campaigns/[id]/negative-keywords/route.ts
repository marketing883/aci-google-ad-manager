import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * POST /api/campaigns/[id]/negative-keywords
 * Body: { text: string, match_type?: string, level: "campaign" | "ad_group", ad_group_id?: string }
 *
 * Creates a negative keyword at either the campaign or ad-group level.
 * The schema check constraint enforces that ad-group-level negatives
 * have an ad_group_id and campaign-level ones don't.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const level = body.level as 'campaign' | 'ad_group' | undefined;
    const matchType = (body.match_type as string) || 'PHRASE';
    const adGroupId = typeof body.ad_group_id === 'string' ? body.ad_group_id : null;

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    if (!level || (level !== 'campaign' && level !== 'ad_group')) {
      return NextResponse.json(
        { error: 'level must be "campaign" or "ad_group"' },
        { status: 400 },
      );
    }
    if (level === 'ad_group' && !adGroupId) {
      return NextResponse.json(
        { error: 'ad_group_id required for ad_group level' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Verify the parent exists for this campaign
    if (level === 'ad_group') {
      const { data: ag } = await supabase
        .from('ad_groups')
        .select('id')
        .eq('id', adGroupId)
        .eq('campaign_id', id)
        .single();
      if (!ag) {
        return NextResponse.json({ error: 'Ad group not found' }, { status: 404 });
      }
    } else {
      const { data: camp } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', id)
        .single();
      if (!camp) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }
    }

    const { data, error } = await supabase
      .from('negative_keywords')
      .insert({
        campaign_id: level === 'campaign' ? id : null,
        ad_group_id: level === 'ad_group' ? adGroupId : null,
        text,
        match_type: matchType,
        level,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create negative keyword' },
      { status: 500 },
    );
  }
}
