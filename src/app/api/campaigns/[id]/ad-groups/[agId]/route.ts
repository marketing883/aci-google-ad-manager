import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// DELETE /api/campaigns/[id]/ad-groups/[agId] — Hard delete ad group + children
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string }> },
) {
  try {
    const { id, agId } = await params;
    const hard = request.nextUrl.searchParams.get('hard') === 'true';
    const supabase = createAdminClient();

    // Verify ad group belongs to campaign
    const { data: ag } = await supabase
      .from('ad_groups')
      .select('id')
      .eq('id', agId)
      .eq('campaign_id', id)
      .single();

    if (!ag) {
      return NextResponse.json({ error: 'Ad group not found' }, { status: 404 });
    }

    if (hard) {
      // CASCADE deletes ads, keywords, negative_keywords
      const { error } = await supabase.from('ad_groups').delete().eq('id', agId);
      if (error) throw error;
    } else {
      // Soft delete group + children
      await Promise.all([
        supabase.from('ad_groups').update({ status: 'removed' }).eq('id', agId),
        supabase.from('ads').update({ status: 'removed' }).eq('ad_group_id', agId),
        supabase.from('keywords').update({ status: 'removed' }).eq('ad_group_id', agId),
      ]);
    }

    return NextResponse.json({ success: true, hard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete ad group' },
      { status: 500 },
    );
  }
}
