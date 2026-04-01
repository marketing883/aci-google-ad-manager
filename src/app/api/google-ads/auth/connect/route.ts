import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google-ads/auth';

export async function POST() {
  try {
    if (!process.env.GOOGLE_ADS_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Google Ads Client ID not configured. Add GOOGLE_ADS_CLIENT_ID to .env.local' },
        { status: 500 },
      );
    }

    const authUrl = buildAuthUrl();
    return NextResponse.json({ auth_url: authUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate auth URL' },
      { status: 500 },
    );
  }
}
