import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// GET /api/analytics/snapshot — Get latest analytics snapshot
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('analytics_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ empty: true, message: 'No snapshots yet. Run the analytics cron or trigger manually.' });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch snapshot' },
      { status: 500 },
    );
  }
}
