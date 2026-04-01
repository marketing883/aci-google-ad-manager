import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// GET /api/approvals — List approval queue items
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const status = request.nextUrl.searchParams.get('status') || 'pending';
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    let query = supabase
      .from('approval_queue')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch approvals' },
      { status: 500 },
    );
  }
}
