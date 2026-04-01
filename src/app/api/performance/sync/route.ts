import { NextResponse } from 'next/server';
import { syncPerformanceData } from '@/lib/google-ads/sync';

// POST /api/performance/sync — Manual sync trigger
export async function POST() {
  try {
    const result = await syncPerformanceData(30);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
