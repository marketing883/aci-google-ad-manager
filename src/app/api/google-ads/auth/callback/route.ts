import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings/connection?error=${encodeURIComponent(error)}`, request.url),
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings/connection?error=no_code', request.url),
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        redirect_uri: CONFIG.googleAds.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      return NextResponse.redirect(
        new URL(`/settings/connection?error=${encodeURIComponent(errorData.error || 'token_exchange_failed')}`, request.url),
      );
    }

    const tokens = await tokenResponse.json();

    // Store tokens in database
    const supabase = createAdminClient();
    const { error: dbError } = await supabase.from('google_ads_accounts').insert({
      customer_id: 'pending', // Will be updated after fetching account info
      account_name: 'Connected Account',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      is_active: true,
    });

    if (dbError) {
      return NextResponse.redirect(
        new URL(`/settings/connection?error=${encodeURIComponent(dbError.message)}`, request.url),
      );
    }

    return NextResponse.redirect(
      new URL('/settings/connection?success=true', request.url),
    );
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/settings/connection?error=${encodeURIComponent('unexpected_error')}`, request.url),
    );
  }
}
