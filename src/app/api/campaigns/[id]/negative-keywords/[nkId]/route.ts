import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * PATCH /api/campaigns/[id]/negative-keywords/[nkId]
 * Body: { text?: string, match_type?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; nkId: string }> },
) {
  try {
    const { nkId } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.text === 'string') updates.text = body.text.trim();
    if (typeof body.match_type === 'string') updates.match_type = body.match_type;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('negative_keywords')
      .update(updates)
      .eq('id', nkId)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Negative keyword not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update negative keyword' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/negative-keywords/[nkId]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; nkId: string }> },
) {
  try {
    const { nkId } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('negative_keywords')
      .delete()
      .eq('id', nkId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete negative keyword' },
      { status: 500 },
    );
  }
}
