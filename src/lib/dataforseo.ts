import { createLogger } from './utils/logger';

const logger = createLogger('DataForSEO');

// ============================================================
// DataForSEO API Client
// Adapted from aci-infotech/src/lib/dataforseo.ts
// ============================================================

const BASE_URL = 'https://api.dataforseo.com/v3';

// 24-hour in-memory cache
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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

async function apiRequest<T>(endpoint: string, body: unknown[]): Promise<T> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error('DataForSEO credentials not configured');
  }

  const auth = Buffer.from(`${login}:${password}`).toString('base64');

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`DataForSEO API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status_code !== 20000) {
    throw new Error(`DataForSEO error: ${data.status_message || 'Unknown error'}`);
  }

  return data;
}

// ---- Types ----

export interface KeywordData {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: number;
  competition_level: string;
  monthly_searches: Array<{ month: number; year: number; search_volume: number }>;
}

export interface RelatedKeyword {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: number;
  competition_level: string;
}

export interface SERPCompetitor {
  domain: string;
  title: string;
  url: string;
  position: number;
  description: string;
}

export interface ComprehensiveKeywordData {
  keyword: KeywordData | null;
  related: RelatedKeyword[];
  competitors: SERPCompetitor[];
  questions: string[];
}

// ---- API Methods ----

/**
 * Get search volume, CPC, and competition for a keyword
 */
export async function getKeywordData(
  keyword: string,
  location = 2840, // US
  language = 'en',
): Promise<KeywordData | null> {
  const cacheKey = `kw:${keyword}:${location}`;
  const cached = getCached<KeywordData>(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiRequest<{ tasks: Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }> }>(
      '/keywords_data/google_ads/search_volume/live',
      [{ keywords: [keyword], location_code: location, language_code: language }],
    );

    // Result can be at tasks[0].result[0] directly or tasks[0].result[0].items[0]
    const taskResult = data.tasks?.[0]?.result;
    const item = taskResult?.[0]?.items?.[0] || taskResult?.[0];
    if (!item || !item.keyword) return null;

    const result: KeywordData = {
      keyword: item.keyword as string,
      search_volume: (item.search_volume as number) || 0,
      cpc: (item.cpc as number) || 0,
      competition: typeof item.competition === 'number' ? item.competition : (item.competition_index as number) || 0,
      competition_level: (item.competition as string) || (item.competition_level as string) || 'UNSPECIFIED',
      monthly_searches: (item.monthly_searches as KeywordData['monthly_searches']) || [],
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.error('getKeywordData failed', { keyword, error: (error as Error).message });
    return null;
  }
}

/**
 * Get related keyword suggestions
 */
export async function getRelatedKeywords(
  keyword: string,
  location = 2840,
  language = 'en',
  limit = 30,
): Promise<RelatedKeyword[]> {
  const cacheKey = `related:${keyword}:${location}`;
  const cached = getCached<RelatedKeyword[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiRequest<{ tasks: Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }> }>(
      '/keywords_data/google_ads/keywords_for_keywords/live',
      [{ keywords: [keyword], location_code: location, language_code: language, limit }],
    );

    // Items can be at result[0].items or result directly
    const taskResult = data.tasks?.[0]?.result;
    const items = taskResult?.[0]?.items || taskResult || [];
    const results: RelatedKeyword[] = (Array.isArray(items) ? items : []).map((item: Record<string, unknown>) => ({
      keyword: (item.keyword as string) || '',
      search_volume: (item.search_volume as number) || 0,
      cpc: (item.cpc as number) || 0,
      competition: typeof item.competition === 'number' ? item.competition : (item.competition_index as number) || 0,
      competition_level: typeof item.competition === 'string' ? item.competition : (item.competition_level as string) || 'UNSPECIFIED',
    })).filter((r) => r.keyword.length > 0);

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getRelatedKeywords failed', { keyword, error: (error as Error).message });
    return [];
  }
}

/**
 * Get SERP competitors for a keyword
 */
export async function getCompetitors(
  keyword: string,
  location = 2840,
  language = 'en',
): Promise<SERPCompetitor[]> {
  const cacheKey = `serp:${keyword}:${location}`;
  const cached = getCached<SERPCompetitor[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiRequest<{ tasks: Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }> }>(
      '/serp/google/organic/live/regular',
      [{ keyword, location_code: location, language_code: language, depth: 10 }],
    );

    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    const results: SERPCompetitor[] = items
      .filter((item: Record<string, unknown>) => item.type === 'organic')
      .map((item: Record<string, unknown>) => ({
        domain: (item.domain as string) || '',
        title: (item.title as string) || '',
        url: (item.url as string) || '',
        position: (item.rank_absolute as number) || 0,
        description: (item.description as string) || '',
      }));

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    logger.error('getCompetitors failed', { keyword, error: (error as Error).message });
    return [];
  }
}

/**
 * Get People Also Ask questions for a keyword
 */
export async function getPeopleAlsoAsk(
  keyword: string,
  location = 2840,
  language = 'en',
): Promise<string[]> {
  const cacheKey = `paa:${keyword}:${location}`;
  const cached = getCached<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiRequest<{ tasks: Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }> }>(
      '/serp/google/organic/live/regular',
      [{ keyword, location_code: location, language_code: language, depth: 10 }],
    );

    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    const questions = items
      .filter((item: Record<string, unknown>) => item.type === 'people_also_ask')
      .flatMap((item: Record<string, unknown>) =>
        ((item.items as Array<{ title: string }>) || []).map((q) => q.title),
      );

    setCache(cacheKey, questions);
    return questions;
  } catch (error) {
    logger.error('getPeopleAlsoAsk failed', { keyword, error: (error as Error).message });
    return [];
  }
}

/**
 * Comprehensive keyword research — runs all endpoints in parallel
 */
export async function comprehensiveKeywordResearch(
  keyword: string,
  location = 2840,
  language = 'en',
): Promise<ComprehensiveKeywordData> {
  const [keywordData, related, competitors, questions] = await Promise.all([
    getKeywordData(keyword, location, language),
    getRelatedKeywords(keyword, location, language),
    getCompetitors(keyword, location, language),
    getPeopleAlsoAsk(keyword, location, language),
  ]);

  return { keyword: keywordData, related, competitors, questions };
}
