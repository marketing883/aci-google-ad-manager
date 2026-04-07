import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// GET /api/visibility — List brand visibility reports
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('brand_visibility_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reports' },
      { status: 500 },
    );
  }
}
