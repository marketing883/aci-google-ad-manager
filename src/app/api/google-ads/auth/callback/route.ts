import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, storeAccount } from '@/lib/google-ads/auth';
import { GoogleAdsClient } from '@/lib/google-ads/client';

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
    const tokens = await exchangeCodeForTokens(code);

    // Store with temporary info — will be updated once we fetch account details
    const accountId = await storeAccount(tokens, {
      customer_id: 'pending',
      account_name: 'Connected Account',
    });

    // Try to fetch actual account info
    try {
      const client = new GoogleAdsClient(accountId, 'pending');
      const accounts = await client.listAccessibleAccounts();

      if (accounts.length > 0) {
        const { createAdminClient } = await import('@/lib/supabase-server');
        const supabase = createAdminClient();

        // Use the first accessible account
        await supabase
          .from('google_ads_accounts')
          .update({
            customer_id: accounts[0].customer_id,
            account_name: accounts[0].descriptive_name || `Account ${accounts[0].customer_id}`,
          })
          .eq('id', accountId);
      }
    } catch {
      // Account info fetch is non-critical — user can update manually
    }

    return NextResponse.redirect(
      new URL('/settings/connection?success=true', request.url),
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unexpected_error';
    return NextResponse.redirect(
      new URL(`/settings/connection?error=${encodeURIComponent(msg)}`, request.url),
    );
  }
}
