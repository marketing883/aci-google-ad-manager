import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';

const logger = createLogger('GA4Client');

// ============================================================
// Google Analytics 4 Data API Client
// Uses v1beta (current production version)
// Auth: reuses Google Ads OAuth tokens (analytics.readonly scope)
// ============================================================

const GA4_API = 'https://analyticsdata.googleapis.com/v1beta';

// 1-hour cache for GA4 data (shorter than DataForSEO since analytics changes more frequently)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// ============================================================
// Types
// ============================================================

export interface GA4TrafficOverview {
  sessions: number;
  users: number;
  new_users: number;
  pageviews: number;
  bounce_rate: number;
  avg_session_duration: number;
  engagement_rate: number;
}

export interface GA4LandingPage {
  page: string;
  sessions: number;
  users: number;
  bounce_rate: number;
  avg_duration: number;
  conversions: number;
  conversion_rate: number;
}

export interface GA4AcquisitionChannel {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  conversions: number;
  bounce_rate: number;
}

export interface GA4DeviceSplit {
  device: string;
  sessions: number;
  users: number;
  conversions: number;
  conversion_rate: number;
  bounce_rate: number;
}

export interface GA4ConversionEvent {
  event_name: string;
  count: number;
}

// ============================================================
// Token Management (reuses Google Ads OAuth tokens)
// ============================================================

async function getValidAccessToken(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: account } = await supabase
    .from('google_ads_accounts')
    .select('id, access_token, refresh_token, token_expires_at, ga4_property_id')
    .eq('is_active', true)
    .single();

  if (!account) {
    logger.warn('No active Google account for GA4');
    return null;
  }

  // Check if token is still valid (5-minute buffer)
  const expiresAt = new Date(account.token_expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return account.access_token;
  }

  // Refresh token
  try {
    const { refreshAccessToken } = await import('../google-ads/auth');
    const refreshed = await refreshAccessToken(account.refresh_token);
    await supabase.from('google_ads_accounts').update({
      access_token: refreshed.access_token,
      token_expires_at: refreshed.expires_at,
    }).eq('id', account.id);
    return refreshed.access_token;
  } catch (error) {
    logger.error('Failed to refresh token for GA4', { error: (error as Error).message });
    return null;
  }
}

async function getGA4PropertyId(): Promise<string | null> {
  const supabase = createAdminClient();

  // Check google_ads_accounts first
  const { data: account } = await supabase
    .from('google_ads_accounts')
    .select('ga4_property_id')
    .eq('is_active', true)
    .single();

  if (account?.ga4_property_id) return account.ga4_property_id;

  // Fallback: check settings table
  const { data: setting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'ga4_property_id')
    .single();

  return (setting?.value as string) || null;
}

// ============================================================
// Core API Method
// ============================================================

interface GA4ReportRequest {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: Record<string, unknown>;
  limit?: number;
  orderBys?: Array<{ metric?: { metricName: string }; desc?: boolean }>;
}

interface GA4Row {
  dimensionValues?: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}

async function runReport(
  propertyId: string,
  request: GA4ReportRequest,
): Promise<GA4Row[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('No valid access token for GA4. Re-connect Google account with analytics scope.');

  const response = await fetch(`${GA4_API}/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    logger.error('GA4 API error', { status: response.status, error: errorText.slice(0, 500) });
    throw new Error(`GA4 API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.rows || [];
}

// ============================================================
// High-Level Methods
// ============================================================

function dateRange(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

/**
 * Get traffic overview: sessions, users, pageviews, bounce rate, engagement
 */
export async function getTrafficOverview(days = 30): Promise<GA4TrafficOverview | null> {
  const propertyId = await getGA4PropertyId();
  if (!propertyId) return null;

  const cacheKey = `ga4:traffic:${propertyId}:${days}`;
  const cached = getCached<GA4TrafficOverview>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await runReport(propertyId, {
      dateRanges: [dateRange(days)],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'screenPageViews' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'engagementRate' },
      ],
    });

    if (rows.length === 0) return null;

    const v = rows[0].metricValues;
    const result: GA4TrafficOverview = {
      sessions: parseInt(v[0]?.value) || 0,
      users: parseInt(v[1]?.value) || 0,
      new_users: parseInt(v[2]?.value) || 0,
      pageviews: parseInt(v[3]?.value) || 0,
      bounce_rate: parseFloat(v[4]?.value) || 0,
      avg_session_duration: parseFloat(v[5]?.value) || 0,
      engagement_rate: parseFloat(v[6]?.value) || 0,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.error('getTrafficOverview failed', { error: (error as Error).message });
    return null;
  }
}

/**
 * Get landing page performance: sessions, bounce rate, conversions per page
 */
export async function getLandingPagePerformance(days = 30, limit = 20): Promise<GA4LandingPage[]> {
  const propertyId = await getGA4PropertyId();
  if (!propertyId) return [];

  const cacheKey = `ga4:landing:${propertyId}:${days}`;
  const cached = getCached<GA4LandingPage[]>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await runReport(propertyId, {
      dateRanges: [dateRange(days)],
      dimensions: [{ name: 'landingPage' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit,
    });

    const results: GA4LandingPage[] = rows.map((row) => {
      const sessions = parseInt(row.metricValues[0]?.value) || 0;
      const conversions = parseFloat(row.metricValues[4]?.value) || 0;
      return {
        page: row.dimensionValues?.[0]?.value || '',
        sessions,
        users: parseInt(row.metricValues[1]?.value) || 0,
        bounce_rate: parseFloat(row.metricValues[2]?.value) || 0,
        avg_duration: parseFloat(row.metricValues[3]?.value) || 0,
        conversions,
        conversion_rate: sessions > 0 ? conversions / sessions : 0,
      };
    });

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getLandingPagePerformance failed', { error: (error as Error).message });
    return [];
  }
}

/**
 * Get acquisition channels: source/medium breakdown
 */
export async function getAcquisitionChannels(days = 30): Promise<GA4AcquisitionChannel[]> {
  const propertyId = await getGA4PropertyId();
  if (!propertyId) return [];

  const cacheKey = `ga4:acquisition:${propertyId}:${days}`;
  const cached = getCached<GA4AcquisitionChannel[]>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await runReport(propertyId, {
      dateRanges: [dateRange(days)],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 15,
    });

    const results: GA4AcquisitionChannel[] = rows.map((row) => ({
      source: row.dimensionValues?.[0]?.value || '',
      medium: row.dimensionValues?.[1]?.value || '',
      sessions: parseInt(row.metricValues[0]?.value) || 0,
      users: parseInt(row.metricValues[1]?.value) || 0,
      conversions: parseFloat(row.metricValues[2]?.value) || 0,
      bounce_rate: parseFloat(row.metricValues[3]?.value) || 0,
    }));

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getAcquisitionChannels failed', { error: (error as Error).message });
    return [];
  }
}

/**
 * Get ad traffic behavior: what happens after someone clicks a Google Ad
 * Filters to source=google, medium=cpc
 */
export async function getAdTrafficBehavior(days = 30): Promise<GA4LandingPage[]> {
  const propertyId = await getGA4PropertyId();
  if (!propertyId) return [];

  const cacheKey = `ga4:adtraffic:${propertyId}:${days}`;
  const cached = getCached<GA4LandingPage[]>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await runReport(propertyId, {
      dateRanges: [dateRange(days)],
      dimensions: [{ name: 'landingPage' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
      ],
      dimensionFilter: {
        andGroup: {
          expressions: [
            { filter: { fieldName: 'sessionSource', stringFilter: { value: 'google' } } },
            { filter: { fieldName: 'sessionMedium', stringFilter: { value: 'cpc' } } },
          ],
        },
      },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 20,
    });

    const results: GA4LandingPage[] = rows.map((row) => {
      const sessions = parseInt(row.metricValues[0]?.value) || 0;
      const conversions = parseFloat(row.metricValues[4]?.value) || 0;
      return {
        page: row.dimensionValues?.[0]?.value || '',
        sessions,
        users: parseInt(row.metricValues[1]?.value) || 0,
        bounce_rate: parseFloat(row.metricValues[2]?.value) || 0,
        avg_duration: parseFloat(row.metricValues[3]?.value) || 0,
        conversions,
        conversion_rate: sessions > 0 ? conversions / sessions : 0,
      };
    });

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getAdTrafficBehavior failed', { error: (error as Error).message });
    return [];
  }
}

/**
 * Get device breakdown: mobile vs desktop performance
 */
export async function getDeviceBreakdown(days = 30): Promise<GA4DeviceSplit[]> {
  const propertyId = await getGA4PropertyId();
  if (!propertyId) return [];

  const cacheKey = `ga4:device:${propertyId}:${days}`;
  const cached = getCached<GA4DeviceSplit[]>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await runReport(propertyId, {
      dateRanges: [dateRange(days)],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' },
      ],
    });

    const results: GA4DeviceSplit[] = rows.map((row) => {
      const sessions = parseInt(row.metricValues[0]?.value) || 0;
      const conversions = parseFloat(row.metricValues[2]?.value) || 0;
      return {
        device: row.dimensionValues?.[0]?.value || '',
        sessions,
        users: parseInt(row.metricValues[1]?.value) || 0,
        conversions,
        conversion_rate: sessions > 0 ? conversions / sessions : 0,
        bounce_rate: parseFloat(row.metricValues[3]?.value) || 0,
      };
    });

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getDeviceBreakdown failed', { error: (error as Error).message });
    return [];
  }
}

/**
 * Get conversion events: key events and their counts
 */
export async function getConversionEvents(days = 30): Promise<GA4ConversionEvent[]> {
  const propertyId = await getGA4PropertyId();
  if (!propertyId) return [];

  const cacheKey = `ga4:conversions:${propertyId}:${days}`;
  const cached = getCached<GA4ConversionEvent[]>(cacheKey);
  if (cached) return cached;

  try {
    const rows = await runReport(propertyId, {
      dateRanges: [dateRange(days)],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'isConversionEvent',
          stringFilter: { value: 'true' },
        },
      },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    });

    const results: GA4ConversionEvent[] = rows.map((row) => ({
      event_name: row.dimensionValues?.[0]?.value || '',
      count: parseInt(row.metricValues[0]?.value) || 0,
    }));

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getConversionEvents failed', { error: (error as Error).message });
    return [];
  }
}
