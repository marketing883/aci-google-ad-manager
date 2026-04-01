import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const agent = request.nextUrl.searchParams.get('agent');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '100');

    let query = supabase
      .from('agent_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (agent && agent !== 'all') {
      query = query.eq('agent_name', agent);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 500 },
    );
  }
}
