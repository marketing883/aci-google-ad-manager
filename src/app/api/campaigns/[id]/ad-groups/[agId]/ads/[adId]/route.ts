import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * PATCH /api/campaigns/[id]/ad-groups/[agId]/ads/[adId]
 * Body: {
 *   headlines?: Array<string | { text: string; pinned_position?: number | null }>,
 *   descriptions?: Array<string | { text: string; pinned_position?: number | null }>,
 *   final_urls?: string[],
 *   path1?: string,
 *   path2?: string,
 * }
 *
 * Updates any of the JSONB array fields on an ad. Headlines and
 * descriptions are normalized to { text, pinned_position } shape so the
 * storage is consistent regardless of whether the client sends strings
 * or objects.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string; adId: string }> },
) {
  try {
    const { agId, adId } = await params;
    const body = await request.json();

    const normalizeItems = (
      items: unknown,
    ): Array<{ text: string; pinned_position: number | null }> | null => {
      if (!Array.isArray(items)) return null;
      return items
        .map((item) => {
          if (typeof item === 'string') {
            return { text: item.trim(), pinned_position: null };
          }
          if (item && typeof item === 'object' && 'text' in item) {
            const it = item as { text: unknown; pinned_position?: unknown };
            return {
              text: typeof it.text === 'string' ? it.text.trim() : '',
              pinned_position:
                typeof it.pinned_position === 'number' ? it.pinned_position : null,
            };
          }
          return { text: '', pinned_position: null };
        })
        .filter((it) => it.text.length > 0);
    };

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ('headlines' in body) {
      const normalized = normalizeItems(body.headlines);
      if (normalized === null) {
        return NextResponse.json(
          { error: 'headlines must be an array' },
          { status: 400 },
        );
      }
      updates.headlines = normalized;
    }
    if ('descriptions' in body) {
      const normalized = normalizeItems(body.descriptions);
      if (normalized === null) {
        return NextResponse.json(
          { error: 'descriptions must be an array' },
          { status: 400 },
        );
      }
      updates.descriptions = normalized;
    }
    if ('final_urls' in body && Array.isArray(body.final_urls)) {
      updates.final_urls = body.final_urls;
    }
    if (typeof body.path1 === 'string') updates.path1 = body.path1.slice(0, 15);
    if (typeof body.path2 === 'string') updates.path2 = body.path2.slice(0, 15);
    if (typeof body.status === 'string') updates.status = body.status;

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ads')
      .update(updates)
      .eq('id', adId)
      .eq('ad_group_id', agId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update ad' },
      { status: 500 },
    );
  }
}

// DELETE handler — preserved from the original implementation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; agId: string; adId: string }> },
) {
  try {
    const { adId, agId } = await params;
    const hard = request.nextUrl.searchParams.get('hard') === 'true';
    const supabase = createAdminClient();

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
      const { error } = await supabase
        .from('ads')
        .update({ status: 'removed' })
        .eq('id', adId);
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
