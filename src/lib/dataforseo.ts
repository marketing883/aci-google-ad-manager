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

// ---- SERP Advanced Types (for Brand Visibility) ----

export interface SerpOrganicItem {
  position: number;
  domain: string;
  title: string;
  url: string;
  description: string;
}

export interface SerpPaidItem {
  position: number;
  domain: string;
  title: string;
  url: string;
  description: string;
}

export interface AiOverviewCitation {
  domain: string;
  url: string;
  title: string;
}

export interface SerpAdvancedResult {
  keyword: string;
  organic: SerpOrganicItem[];
  paid: SerpPaidItem[];
  ai_overview_exists: boolean;
  ai_overview_citations: AiOverviewCitation[];
  featured_snippet: { domain: string; title: string; url: string } | null;
  people_also_ask: string[];
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
 * Get full SERP data including organic, paid, AI overviews, and featured snippets.
 * Uses /live/advanced endpoint — same cost as /regular ($0.002) + $0.002 for async AI overview.
 * Used by the Brand Visibility Report.
 */
export async function getSerpAdvanced(
  keyword: string,
  location = 2840,
  language = 'en',
): Promise<SerpAdvancedResult> {
  const cacheKey = `serp_adv:${keyword}:${location}`;
  const cached = getCached<SerpAdvancedResult>(cacheKey);
  if (cached) return cached;

  try {
    const data = await apiRequest<{ tasks: Array<{ result: Array<{ items: Array<Record<string, unknown>> }> }> }>(
      '/serp/google/organic/live/advanced',
      [{
        keyword,
        location_code: location,
        language_code: language,
        depth: 20,
        load_async_ai_overview: true,
      }],
    );

    const items = data.tasks?.[0]?.result?.[0]?.items || [];

    // Extract organic results
    const organic: SerpOrganicItem[] = items
      .filter((item: Record<string, unknown>) => item.type === 'organic')
      .map((item: Record<string, unknown>) => ({
        position: (item.rank_absolute as number) || 0,
        domain: (item.domain as string) || '',
        title: (item.title as string) || '',
        url: (item.url as string) || '',
        description: (item.description as string) || '',
      }));

    // Extract paid results
    const paid: SerpPaidItem[] = items
      .filter((item: Record<string, unknown>) => item.type === 'paid')
      .map((item: Record<string, unknown>) => ({
        position: (item.rank_absolute as number) || 0,
        domain: (item.domain as string) || '',
        title: (item.title as string) || '',
        url: (item.url as string) || '',
        description: (item.description as string) || '',
      }));

    // Extract AI Overview citations
    let ai_overview_exists = false;
    const ai_overview_citations: AiOverviewCitation[] = [];
    const aiOverviewItems = items.filter((item: Record<string, unknown>) => item.type === 'ai_overview');
    if (aiOverviewItems.length > 0) {
      ai_overview_exists = true;
      for (const aiItem of aiOverviewItems) {
        // AI Overview has nested items with references
        const references = (aiItem as Record<string, unknown>).references as Array<Record<string, unknown>> | undefined;
        const nestedItems = (aiItem as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined;

        // Check references array (direct citations)
        if (references) {
          for (const ref of references) {
            ai_overview_citations.push({
              domain: (ref.domain as string) || '',
              url: (ref.url as string) || '',
              title: (ref.title as string) || '',
            });
          }
        }

        // Check nested items for references
        if (nestedItems) {
          for (const nested of nestedItems) {
            const nestedRefs = nested.references as Array<Record<string, unknown>> | undefined;
            if (nestedRefs) {
              for (const ref of nestedRefs) {
                ai_overview_citations.push({
                  domain: (ref.domain as string) || '',
                  url: (ref.url as string) || '',
                  title: (ref.title as string) || '',
                });
              }
            }
          }
        }
      }
    }

    // Extract featured snippet
    let featured_snippet: SerpAdvancedResult['featured_snippet'] = null;
    const snippetItems = items.filter((item: Record<string, unknown>) => item.type === 'featured_snippet');
    if (snippetItems.length > 0) {
      const s = snippetItems[0];
      featured_snippet = {
        domain: (s.domain as string) || '',
        title: (s.title as string) || '',
        url: (s.url as string) || '',
      };
    }

    // Extract People Also Ask
    const people_also_ask: string[] = [];
    const paaItems = items.filter((item: Record<string, unknown>) => item.type === 'people_also_ask');
    for (const paa of paaItems) {
      const paaChildren = (paa as Record<string, unknown>).items as Array<{ title: string }> | undefined;
      if (paaChildren) {
        for (const q of paaChildren) {
          if (q.title) people_also_ask.push(q.title);
        }
      }
    }

    const result: SerpAdvancedResult = {
      keyword,
      organic,
      paid,
      ai_overview_exists,
      ai_overview_citations,
      featured_snippet,
      people_also_ask,
    };

    setCache(cacheKey, result);
    logger.info(`SERP Advanced: "${keyword}" — ${organic.length} organic, ${paid.length} paid, AI overview: ${ai_overview_exists}, ${ai_overview_citations.length} citations`);
    return result;
  } catch (error) {
    logger.error('getSerpAdvanced failed', { keyword, error: (error as Error).message });
    return {
      keyword,
      organic: [],
      paid: [],
      ai_overview_exists: false,
      ai_overview_citations: [],
      featured_snippet: null,
      people_also_ask: [],
    };
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
