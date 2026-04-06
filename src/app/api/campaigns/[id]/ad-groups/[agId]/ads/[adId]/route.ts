import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// DELETE /api/campaigns/[id]/ad-groups/[agId]/ads/[adId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string; adId: string }> },
) {
  try {
    const { adId, agId } = await params;
    const hard = request.nextUrl.searchParams.get('hard') === 'true';
    const supabase = createAdminClient();

    // Verify ad belongs to ad group
    const { data: ad } = await supabase
      .from('ads')
      .select('id')
      .eq('id', adId)
      .eq('ad_group_id', agId)
      .single();

    if (!ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    }

    if (hard) {
      const { error } = await supabase.from('ads').delete().eq('id', adId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('ads').update({ status: 'removed' }).eq('id', adId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, hard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete ad' },
      { status: 500 },
    );
  }
}
