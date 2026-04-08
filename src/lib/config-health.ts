import { createAdminClient } from './supabase-server';
import { createLogger } from './utils/logger';

const logger = createLogger('ConfigHealth');

// ============================================================
// Configuration Health Check
// Determines what's configured and what's missing.
// Used by pages to show specific guidance instead of failing.
// ============================================================

export interface SetupStatus {
  googleAds: { connected: boolean; customerId: string | null; hasValidToken: boolean };
  ga4: { connected: boolean; propertyId: string | null };
  companyProfile: { configured: boolean; hasName: boolean; hasServices: boolean; hasCompetitors: boolean };
  dataForSeo: { configured: boolean };
  overall: { stepsComplete: number; stepsTotal: number; ready: boolean };
}

/**
 * Check all configuration requirements.
 * Returns what's configured and what's missing — no API calls to external services.
 * Fast enough to call on every page load (reads from DB only).
 */
export async function checkSetupStatus(): Promise<SetupStatus> {
  const supabase = createAdminClient();

  // Check Google Ads
  let googleAds = { connected: false, customerId: null as string | null, hasValidToken: false };
  try {
    const { data: account } = await supabase
      .from('google_ads_accounts')
      .select('customer_id, access_token, token_expires_at, is_active')
      .eq('is_active', true)
      .single();

    if (account) {
      googleAds.connected = true;
      googleAds.customerId = account.customer_id !== 'pending' ? account.customer_id : null;
      googleAds.hasValidToken = account.access_token && new Date(account.token_expires_at) > new Date();
    }
  } catch { /* no account */ }

  // Check GA4
  let ga4 = { connected: false, propertyId: null as string | null };
  try {
    // Check google_ads_accounts first
    const { data: account } = await supabase
      .from('google_ads_accounts')
      .select('ga4_property_id')
      .eq('is_active', true)
      .single();

    if (account?.ga4_property_id) {
      ga4 = { connected: true, propertyId: account.ga4_property_id };
    } else {
      // Fallback: check settings table
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'ga4_property_id')
        .single();

      if (setting?.value) {
        ga4 = { connected: true, propertyId: setting.value as string };
      }
    }
  } catch { /* no GA4 */ }

  // Check Company Profile
  let companyProfile = { configured: false, hasName: false, hasServices: false, hasCompetitors: false };
  try {
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'company_profile')
      .single();

    if (setting?.value) {
      const profile = setting.value as Record<string, unknown>;
      companyProfile.hasName = !!(profile.company_name && profile.domain);
      companyProfile.hasServices = Array.isArray(profile.services) && profile.services.length > 0;
      companyProfile.hasCompetitors = Array.isArray(profile.known_competitors) && profile.known_competitors.length > 0;
      companyProfile.configured = companyProfile.hasName;
    }
  } catch { /* no profile */ }

  // Check DataForSEO
  const dataForSeo = {
    configured: !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),
  };

  // Overall status
  const stepsComplete = [
    googleAds.connected && googleAds.customerId,
    ga4.connected,
    companyProfile.configured,
    dataForSeo.configured,
  ].filter(Boolean).length;

  return {
    googleAds,
    ga4,
    companyProfile,
    dataForSeo,
    overall: {
      stepsComplete,
      stepsTotal: 4,
      ready: stepsComplete >= 2, // Minimum: Google Ads + one other
    },
  };
}
