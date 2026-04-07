import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/agents/tools';
import { createAdminClient } from '@/lib/supabase-server';

// POST /api/visibility/run — Run a brand visibility report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = await executeTool('brand_visibility_report', body);

    // Find the report that was just created
    const supabase = createAdminClient();
    const { data: latestReport } = await supabase
      .from('brand_visibility_reports')
      .select('id')
      .eq('brand_name', body.brand_name)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      ...result,
      report_id: latestReport?.id || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 },
    );
  }
}
