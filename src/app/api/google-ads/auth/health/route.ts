import { NextResponse } from 'next/server';
import { checkTokenHealth } from '@/lib/google-ads/auth';

// GET /api/google-ads/auth/health — Test if Google Ads token is valid
export async function GET() {
  try {
    const result = await checkTokenHealth();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { healthy: false, error: error instanceof Error ? error.message : 'Health check failed' },
    );
  }
}
