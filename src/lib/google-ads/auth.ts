import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { CONFIG } from '../config';
import type { GoogleAdsTokens } from './types';

const logger = createLogger('GoogleAdsAuth');

// ============================================================
// Google Ads OAuth2 Authentication
// ============================================================

/**
 * Build the OAuth2 authorization URL for Google Ads
 */
export function buildAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    redirect_uri: CONFIG.googleAds.redirectUri,
    response_type: 'code',
    scope: CONFIG.googleAds.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    ...(state && { state }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for access + refresh tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleAdsTokens> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
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

  if (!response.ok) {
    const error = await response.json();
    logger.error('Token exchange failed', { error });
    throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_at: string;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    logger.error('Token refresh failed', { error });
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Get valid tokens for an account, refreshing if needed
 */
export async function getValidTokens(accountId: string): Promise<{
  access_token: string;
  developer_token: string;
  login_customer_id?: string;
}> {
  const supabase = createAdminClient();

  const { data: account, error } = await supabase
    .from('google_ads_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (error || !account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  if (!account.refresh_token) {
    throw new Error('No refresh token available. Please reconnect your Google Ads account.');
  }

  let accessToken = account.access_token;

  // Check if token is expired or will expire in next 5 minutes
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : new Date(0);
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer

  if (Date.now() > expiresAt.getTime() - bufferMs) {
    logger.info(`Refreshing expired token for account ${accountId}`);

    const refreshed = await refreshAccessToken(account.refresh_token);
    accessToken = refreshed.access_token;

    // Update tokens in database
    await supabase
      .from('google_ads_accounts')
      .update({
        access_token: refreshed.access_token,
        token_expires_at: refreshed.expires_at,
      })
      .eq('id', accountId);
  }

  return {
    access_token: accessToken,
    developer_token: account.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    login_customer_id: account.login_customer_id || undefined,
  };
}

/**
 * Store tokens and account info after OAuth callback
 */
export async function storeAccount(
  tokens: GoogleAdsTokens,
  accountInfo: { customer_id: string; account_name: string; login_customer_id?: string },
): Promise<string> {
  const supabase = createAdminClient();

  // Deactivate any existing accounts
  await supabase
    .from('google_ads_accounts')
    .update({ is_active: false })
    .eq('is_active', true);

  // Insert new account
  const { data, error } = await supabase
    .from('google_ads_accounts')
    .insert({
      customer_id: accountInfo.customer_id,
      account_name: accountInfo.account_name,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokens.expires_at,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
      login_customer_id: accountInfo.login_customer_id,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to store account: ${error.message}`);

  logger.info(`Stored Google Ads account: ${accountInfo.customer_id}`);
  return data.id;
}

/**
 * Get the active Google Ads account
 */
export async function getActiveAccount() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('google_ads_accounts')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Disconnect (deactivate) the current Google Ads account
 */
export async function disconnectAccount(): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('google_ads_accounts')
    .update({ is_active: false })
    .eq('is_active', true);

  logger.info('Google Ads account disconnected');
}
