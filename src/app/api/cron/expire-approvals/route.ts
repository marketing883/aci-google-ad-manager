import { NextRequest, NextResponse } from 'next/server';
import { approvalEngine } from '@/lib/approval-engine';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const expiredCount = await approvalEngine.expireOldItems();

    return NextResponse.json({
      success: true,
      expired: expiredCount,
      ran_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Expiry failed' },
      { status: 500 },
    );
  }
}
