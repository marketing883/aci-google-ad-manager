import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createAdGroupSchema } from '@/schemas/campaign';

// GET /api/campaigns/[id]/ad-groups
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('ad_groups')
      .select('*, ads(count), keywords(count)')
      .eq('campaign_id', id)
      .neq('status', 'removed')
      .order('created_at');

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch ad groups' },
      { status: 500 },
    );
  }
}

// POST /api/campaigns/[id]/ad-groups
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = createAdGroupSchema.parse({ ...body, campaign_id: id });

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('ad_groups')
      .insert(validated)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create ad group' },
      { status: 500 },
    );
  }
}
