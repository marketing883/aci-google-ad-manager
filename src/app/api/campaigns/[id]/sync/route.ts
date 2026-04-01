import { NextRequest, NextResponse } from 'next/server';
import { syncPerformanceData } from '@/lib/google-ads/sync';

// POST /api/campaigns/[id]/sync — Manual sync trigger
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // For now, sync all campaigns (can be scoped later)
    const result = await syncPerformanceData(30);

    return NextResponse.json({
      success: true,
      campaign_id: id,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
