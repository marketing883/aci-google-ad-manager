import { NextRequest, NextResponse } from 'next/server';
import { syncPerformanceData, importCampaignsFromGoogle } from '@/lib/google-ads/sync';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Import any new campaigns from Google Ads
    const imported = await importCampaignsFromGoogle();

    // Sync performance data for the last 7 days
    const result = await syncPerformanceData(7);

    return NextResponse.json({
      success: true,
      campaigns_imported: imported,
      ...result,
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
