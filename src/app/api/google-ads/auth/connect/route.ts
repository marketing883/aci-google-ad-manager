import { NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';

export async function POST() {
  try {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'Google Ads Client ID not configured' },
        { status: 500 },
      );
    }

    // Build OAuth2 authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: CONFIG.googleAds.redirectUri,
      response_type: 'code',
      scope: CONFIG.googleAds.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return NextResponse.json({ auth_url: authUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate auth URL' },
      { status: 500 },
    );
  }
}
