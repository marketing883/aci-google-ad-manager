import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// GET /api/competitors — List tracked competitors
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('competitor_data')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch competitors' },
      { status: 500 },
    );
  }
}

// POST /api/competitors — Add a competitor manually
export async function POST(request: NextRequest) {
  try {
    const { domain, company_name } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('competitor_data')
      .upsert({
        domain: domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
        company_name: company_name || null,
      }, { onConflict: 'domain' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add competitor' },
      { status: 500 },
    );
  }
}

// DELETE /api/competitors — Remove a competitor
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    await supabase.from('competitor_data').delete().eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete competitor' },
      { status: 500 },
    );
  }
}
