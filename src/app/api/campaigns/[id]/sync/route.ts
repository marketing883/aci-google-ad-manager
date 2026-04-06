import { NextRequest, NextResponse } from 'next/server';
import { syncPerformanceData, rePushAds } from '@/lib/google-ads/sync';

// POST /api/campaigns/[id]/sync — Sync or re-push
// ?action=push_ads — re-push ads to Google Ads
// default — pull performance data
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'push_ads') {
      const result = await rePushAds(id);
      return NextResponse.json(result);
    }

    // Default: sync performance data
    const result = await syncPerformanceData(30);
    return NextResponse.json({ success: true, campaign_id: id, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
