import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * POST /api/campaigns/[id]/ad-groups/[agId]/keywords
 * Body: { text: string, match_type?: "BROAD" | "PHRASE" | "EXACT", cpc_bid_micros?: number }
 *
 * Creates a single keyword under the given ad group. Used by the inline
 * add form on the Portfolio detail page's EditableItemList.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string }> },
) {
  try {
    const { id, agId } = await params;
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const matchType = (body.match_type as string) || 'BROAD';

    if (!text) {
      return NextResponse.json(
        { error: 'text is required' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Verify the ad group belongs to the campaign
    const { data: ag } = await supabase
      .from('ad_groups')
      .select('id')
      .eq('id', agId)
      .eq('campaign_id', id)
      .single();

    if (!ag) {
      return NextResponse.json({ error: 'Ad group not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('keywords')
      .insert({
        ad_group_id: agId,
        text,
        match_type: matchType,
        cpc_bid_micros: typeof body.cpc_bid_micros === 'number' ? body.cpc_bid_micros : null,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create keyword' },
      { status: 500 },
    );
  }
}
