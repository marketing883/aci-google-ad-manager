import { NextResponse } from 'next/server';
import { disconnectAccount } from '@/lib/google-ads/auth';

export async function POST() {
  try {
    await disconnectAccount();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to disconnect' },
      { status: 500 },
    );
  }
}
