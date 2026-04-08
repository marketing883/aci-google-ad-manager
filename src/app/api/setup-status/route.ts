import { NextResponse } from 'next/server';
import { checkSetupStatus } from '@/lib/config-health';

// GET /api/setup-status — Returns what's configured and what's missing
export async function GET() {
  try {
    const status = await checkSetupStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check setup' },
      { status: 500 },
    );
  }
}
