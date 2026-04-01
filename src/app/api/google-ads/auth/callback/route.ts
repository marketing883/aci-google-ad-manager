import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, storeAccount } from '@/lib/google-ads/auth';
import { GoogleAdsClient } from '@/lib/google-ads/client';

function getBaseUrl(request: NextRequest): string {
  // In Codespaces/proxied environments, use forwarded headers
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // Fallback to request URL origin
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);

  try {
    const code = request.nextUrl.searchParams.get('code');
    const error = request.nextUrl.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${baseUrl}/settings/connection?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${baseUrl}/settings/connection?error=no_code`);
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store with temporary info
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

        await supabase
          .from('google_ads_accounts')
          .update({
            customer_id: accounts[0].customer_id,
            account_name: accounts[0].descriptive_name || `Account ${accounts[0].customer_id}`,
          })
          .eq('id', accountId);
      }
    } catch {
      // Account info fetch is non-critical
    }

    return NextResponse.redirect(`${baseUrl}/settings/connection?success=true`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'unexpected_error';
    return NextResponse.redirect(`${baseUrl}/settings/connection?error=${encodeURIComponent(msg)}`);
  }
}
