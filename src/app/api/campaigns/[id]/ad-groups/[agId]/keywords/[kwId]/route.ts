import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * PATCH /api/campaigns/[id]/ad-groups/[agId]/keywords/[kwId]
 * Body: { text?: string, match_type?: string, cpc_bid_micros?: number }
 *
 * Updates any subset of keyword fields. Used by the inline edit action
 * on the Portfolio detail keywords list.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string; kwId: string }> },
) {
  try {
    const { agId, kwId } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof body.text === 'string') updates.text = body.text.trim();
    if (typeof body.match_type === 'string') updates.match_type = body.match_type;
    if (typeof body.cpc_bid_micros === 'number')
      updates.cpc_bid_micros = body.cpc_bid_micros;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('keywords')
      .update(updates)
      .eq('id', kwId)
      .eq('ad_group_id', agId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Keyword not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update keyword' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/ad-groups/[agId]/keywords/[kwId]
 * Hard delete by default; pass ?hard=false for soft delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string; kwId: string }> },
) {
  try {
    const { agId, kwId } = await params;
    const hard = request.nextUrl.searchParams.get('hard') !== 'false';
    const supabase = createAdminClient();

    if (hard) {
      const { error } = await supabase
        .from('keywords')
        .delete()
        .eq('id', kwId)
        .eq('ad_group_id', agId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('keywords')
        .update({ status: 'removed' })
        .eq('id', kwId)
        .eq('ad_group_id', agId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, hard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete keyword' },
      { status: 500 },
    );
  }
}
