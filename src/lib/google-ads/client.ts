import { createLogger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { getValidTokens } from './auth';
import type {
  GoogleAdsAccountInfo,
  GoogleAdsCampaign,
  GoogleAdsAdGroup,
  GoogleAdsAd,
  GoogleAdsKeyword,
  GoogleAdsPerformanceRow,
  KeywordPlannerResult,
  MutateResult,
} from './types';
import { CONFIG } from '../config';

const logger = createLogger('GoogleAdsClient');

const API_VERSION = CONFIG.googleAds.apiVersion;
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;

// ============================================================
// Google Ads API Client
// ============================================================

export class GoogleAdsClient {
  private accountId: string;
  private customerId: string;

  constructor(accountId: string, customerId: string) {
    this.accountId = accountId;
    this.customerId = customerId.replace(/-/g, ''); // Remove dashes
  }

  // ---- Core API Methods ----

  /**
   * Execute a Google Ads query (GAQL)
   */
  async query<T = Record<string, unknown>>(gaql: string): Promise<T[]> {
    const tokens = await getValidTokens(this.accountId);

    const response = await withRetry(
      () =>
        fetch(`${BASE_URL}/customers/${this.customerId}/googleAds:searchStream`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'developer-token': tokens.developer_token,
            'Content-Type': 'application/json',
            ...(tokens.login_customer_id && {
              'login-customer-id': tokens.login_customer_id.replace(/-/g, ''),
            }),
          },
          body: JSON.stringify({ query: gaql }),
        }),
      { maxAttempts: 2 },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = this.extractErrorMessage(errorBody);
      logger.error(`GAQL query failed: ${errorMsg}`, { query: gaql.slice(0, 200) });
      throw new Error(`Google Ads API error: ${errorMsg}`);
    }

    const data = await response.json();

    // searchStream returns an array of batches, each with a results array
    const results: T[] = [];
    if (Array.isArray(data)) {
      for (const batch of data) {
        if (batch.results) {
          results.push(...batch.results);
        }
      }
    }

    return results;
  }

  /**
   * Execute a mutate operation
   */
  async mutate(
    entityType: string,
    operations: Array<{ create?: unknown; update?: unknown; remove?: string }>,
  ): Promise<MutateResult[]> {
    const tokens = await getValidTokens(this.accountId);
    const endpoint = `${BASE_URL}/customers/${this.customerId}/${entityType}:mutate`;

    const response = await withRetry(
      () =>
        fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'developer-token': tokens.developer_token,
            'Content-Type': 'application/json',
            ...(tokens.login_customer_id && {
              'login-customer-id': tokens.login_customer_id.replace(/-/g, ''),
            }),
          },
          body: JSON.stringify({ operations }),
        }),
      { maxAttempts: 2 },
    );

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      let errorMsg: string;
      try {
        const errorBody = JSON.parse(responseText);
        errorMsg = this.extractErrorMessage(errorBody);
      } catch {
        errorMsg = responseText.slice(0, 500) || `HTTP ${response.status} ${response.statusText}`;
      }
      logger.error(`Mutate failed for ${entityType}`, { status: response.status, error: errorMsg });
      throw new Error(`Mutate failed (${response.status}): ${errorMsg}`);
    }

    const data = await response.json();

    return (data.results || []).map((r: { resourceName?: string }) => ({
      success: true,
      resource_name: r.resourceName,
    }));
  }

  // ---- Account Info ----

  async getAccountInfo(): Promise<GoogleAdsAccountInfo> {
    const results = await this.query<{ customer: GoogleAdsAccountInfo }>(
      `SELECT customer.id, customer.descriptive_name, customer.currency_code,
              customer.time_zone, customer.manager
       FROM customer LIMIT 1`,
    );

    if (!results.length) throw new Error('Could not fetch account info');
    return results[0].customer;
  }

  /**
   * List accessible customer accounts (for MCC managers)
   */
  async listAccessibleAccounts(): Promise<GoogleAdsAccountInfo[]> {
    const tokens = await getValidTokens(this.accountId);

    const response = await fetch(
      `${BASE_URL}/customers:listAccessibleCustomers`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'developer-token': tokens.developer_token,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Failed to list accessible accounts');
    }

    const data = await response.json();
    return (data.resourceNames || []).map((rn: string) => ({
      customer_id: rn.replace('customers/', ''),
      descriptive_name: '',
      currency_code: '',
      time_zone: '',
      manager: false,
    }));
  }

  // ---- Campaigns ----

  async getCampaigns(status?: 'ENABLED' | 'PAUSED'): Promise<GoogleAdsCampaign[]> {
    let query = `
      SELECT campaign.id, campaign.name, campaign.status,
             campaign.advertising_channel_type, campaign.campaign_budget,
             campaign.bidding_strategy_type, campaign.start_date, campaign.end_date,
             campaign.target_cpa.target_cpa_micros, campaign.target_roas.target_roas,
             campaign.network_settings.target_google_search,
             campaign.network_settings.target_search_network,
             campaign.network_settings.target_content_network
      FROM campaign
      WHERE campaign.status != 'REMOVED'`;

    if (status) {
      query += ` AND campaign.status = '${status}'`;
    }

    const results = await this.query<{ campaign: GoogleAdsCampaign }>(query);
    return results.map((r) => r.campaign);
  }

  async createCampaign(campaign: {
    name: string;
    budget_micros: number;
    channel_type: string;
    bidding_strategy: string;
    target_cpa_micros?: number;
    target_roas?: number;
    network_settings?: { search: boolean; display: boolean; partners: boolean };
  }): Promise<MutateResult[]> {
    // First create the budget
    const budgetResults = await this.mutate('campaignBudgets', [
      {
        create: {
          name: `${campaign.name} Budget`,
          amountMicros: campaign.budget_micros.toString(),
          deliveryMethod: 'STANDARD',
        },
      },
    ]);

    if (!budgetResults[0]?.resource_name) {
      throw new Error('Failed to create campaign budget');
    }

    // Then create the campaign
    const campaignData: Record<string, unknown> = {
      name: campaign.name,
      campaignBudget: budgetResults[0].resource_name,
      advertisingChannelType: campaign.channel_type,
      status: 'PAUSED', // Always start paused
    };

    // Bidding strategy — Google Ads API needs strategy-specific objects, not just the enum
    switch (campaign.bidding_strategy) {
      case 'MANUAL_CPC':
        campaignData.manualCpc = { enhancedCpcEnabled: false };
        break;
      case 'MAXIMIZE_CLICKS':
        campaignData.maximizeClicks = {};
        break;
      case 'MAXIMIZE_CONVERSIONS':
        campaignData.maximizeConversions = campaign.target_cpa_micros
          ? { targetCpaMicros: campaign.target_cpa_micros.toString() }
          : {};
        break;
      case 'MAXIMIZE_CONVERSION_VALUE':
        campaignData.maximizeConversionValue = campaign.target_roas
          ? { targetRoas: campaign.target_roas }
          : {};
        break;
      case 'TARGET_CPA':
        campaignData.targetCpa = { targetCpaMicros: (campaign.target_cpa_micros || 0).toString() };
        break;
      case 'TARGET_ROAS':
        campaignData.targetRoas = { targetRoas: campaign.target_roas || 0 };
        break;
      default:
        campaignData.maximizeClicks = {};
    }

    if (campaign.target_cpa_micros && !campaignData.targetCpa) {
      campaignData.targetCpa = {
        targetCpaMicros: campaign.target_cpa_micros.toString(),
      };
    }

    if (campaign.target_roas && !campaignData.targetRoas) {
      campaignData.targetRoas = {
        targetRoas: campaign.target_roas,
      };
    }

    if (campaign.network_settings) {
      campaignData.networkSettings = {
        targetGoogleSearch: campaign.network_settings.search,
        targetSearchNetwork: campaign.network_settings.partners,
        targetContentNetwork: campaign.network_settings.display,
      };
    }

    return this.mutate('campaigns', [{ create: campaignData }]);
  }

  async updateCampaignStatus(
    campaignResourceName: string,
    status: 'ENABLED' | 'PAUSED' | 'REMOVED',
  ): Promise<MutateResult[]> {
    return this.mutate('campaigns', [
      {
        update: {
          resourceName: campaignResourceName,
          status,
        },
      },
    ]);
  }

  // ---- Ad Groups ----

  async getAdGroups(campaignId: string): Promise<GoogleAdsAdGroup[]> {
    const results = await this.query<{ adGroup: GoogleAdsAdGroup }>(
      `SELECT ad_group.id, ad_group.name, ad_group.campaign,
              ad_group.status, ad_group.cpc_bid_micros
       FROM ad_group
       WHERE campaign.id = '${campaignId}'
         AND ad_group.status != 'REMOVED'`,
    );
    return results.map((r) => r.adGroup);
  }

  async createAdGroup(adGroup: {
    campaign_resource_name: string;
    name: string;
    cpc_bid_micros?: number;
  }): Promise<MutateResult[]> {
    return this.mutate('adGroups', [
      {
        create: {
          campaign: adGroup.campaign_resource_name,
          name: adGroup.name,
          status: 'ENABLED',
          ...(adGroup.cpc_bid_micros && {
            cpcBidMicros: adGroup.cpc_bid_micros.toString(),
          }),
        },
      },
    ]);
  }

  // ---- Ads ----

  async getAds(adGroupId: string): Promise<GoogleAdsAd[]> {
    const results = await this.query<{ adGroupAd: { ad: GoogleAdsAd; status: string } }>(
      `SELECT ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines,
              ad_group_ad.ad.responsive_search_ad.descriptions,
              ad_group_ad.ad.final_urls, ad_group_ad.ad.type,
              ad_group_ad.status
       FROM ad_group_ad
       WHERE ad_group.id = '${adGroupId}'
         AND ad_group_ad.status != 'REMOVED'`,
    );
    return results.map((r) => ({ ...r.adGroupAd.ad, status: r.adGroupAd.status as GoogleAdsAd['status'] }));
  }

  async createResponsiveSearchAd(ad: {
    ad_group_resource_name: string;
    headlines: Array<{ text: string; pinned_field?: string }>;
    descriptions: Array<{ text: string; pinned_field?: string }>;
    final_urls: string[];
    path1?: string;
    path2?: string;
  }): Promise<MutateResult[]> {
    return this.mutate('adGroupAds', [
      {
        create: {
          adGroup: ad.ad_group_resource_name,
          status: 'ENABLED',
          ad: {
            responsiveSearchAd: {
              headlines: ad.headlines,
              descriptions: ad.descriptions,
            },
            finalUrls: ad.final_urls,
            ...(ad.path1 && { path1: ad.path1 }),
            ...(ad.path2 && { path2: ad.path2 }),
          },
        },
      },
    ]);
  }

  // ---- Keywords ----

  async getKeywords(adGroupId: string): Promise<GoogleAdsKeyword[]> {
    const results = await this.query<{ adGroupCriterion: GoogleAdsKeyword }>(
      `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
              ad_group_criterion.keyword.match_type, ad_group_criterion.status,
              ad_group_criterion.cpc_bid_micros,
              ad_group_criterion.quality_info.quality_score
       FROM ad_group_criterion
       WHERE ad_group.id = '${adGroupId}'
         AND ad_group_criterion.type = 'KEYWORD'
         AND ad_group_criterion.status != 'REMOVED'`,
    );
    return results.map((r) => r.adGroupCriterion);
  }

  async addKeywords(
    adGroupResourceName: string,
    keywords: Array<{ text: string; match_type: string; cpc_bid_micros?: number }>,
  ): Promise<MutateResult[]> {
    const operations = keywords.map((kw) => ({
      create: {
        adGroup: adGroupResourceName,
        status: 'ENABLED',
        keyword: {
          text: kw.text,
          matchType: kw.match_type,
        },
        ...(kw.cpc_bid_micros && {
          cpcBidMicros: kw.cpc_bid_micros.toString(),
        }),
      },
    }));

    return this.mutate('adGroupCriteria', operations);
  }

  async updateKeywordBid(
    criterionResourceName: string,
    newBidMicros: number,
  ): Promise<MutateResult[]> {
    return this.mutate('adGroupCriteria', [
      {
        update: {
          resourceName: criterionResourceName,
          cpcBidMicros: newBidMicros.toString(),
        },
      },
    ]);
  }

  // ---- Performance Reporting ----

  async getCampaignPerformance(
    dateFrom: string,
    dateTo: string,
  ): Promise<GoogleAdsPerformanceRow[]> {
    const results = await this.query<{
      campaign: { id: string };
      segments: { date: string };
      metrics: GoogleAdsPerformanceRow['metrics'];
    }>(
      `SELECT campaign.id, segments.date,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value,
              metrics.ctr, metrics.average_cpc,
              metrics.search_impression_share
       FROM campaign
       WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
         AND campaign.status != 'REMOVED'
       ORDER BY segments.date DESC`,
    );

    return results.map((r) => ({
      campaign_id: r.campaign.id,
      date: r.segments.date,
      metrics: r.metrics,
    }));
  }

  async getAdGroupPerformance(
    campaignId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<GoogleAdsPerformanceRow[]> {
    const results = await this.query<{
      adGroup: { id: string };
      segments: { date: string };
      metrics: GoogleAdsPerformanceRow['metrics'];
    }>(
      `SELECT ad_group.id, segments.date,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value,
              metrics.ctr, metrics.average_cpc
       FROM ad_group
       WHERE campaign.id = '${campaignId}'
         AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
         AND ad_group.status != 'REMOVED'
       ORDER BY segments.date DESC`,
    );

    return results.map((r) => ({
      ad_group_id: r.adGroup.id,
      date: r.segments.date,
      metrics: r.metrics,
    }));
  }

  async getKeywordPerformance(
    adGroupId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<GoogleAdsPerformanceRow[]> {
    const results = await this.query<{
      adGroupCriterion: { criterionId: string };
      segments: { date: string };
      metrics: GoogleAdsPerformanceRow['metrics'];
    }>(
      `SELECT ad_group_criterion.criterion_id, segments.date,
              metrics.impressions, metrics.clicks, metrics.cost_micros,
              metrics.conversions, metrics.conversions_value,
              metrics.ctr, metrics.average_cpc
       FROM keyword_view
       WHERE ad_group.id = '${adGroupId}'
         AND segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
       ORDER BY segments.date DESC`,
    );

    return results.map((r) => ({
      keyword_id: r.adGroupCriterion.criterionId,
      date: r.segments.date,
      metrics: r.metrics,
    }));
  }

  // ---- Keyword Planning ----

  async generateKeywordIdeas(
    seedKeywords: string[],
    language?: string,
    geoTargetIds?: string[],
  ): Promise<KeywordPlannerResult[]> {
    const tokens = await getValidTokens(this.accountId);

    const body: Record<string, unknown> = {
      keywordSeed: { keywords: seedKeywords },
    };

    if (language) {
      body.language = `languageConstants/${language}`;
    }
    if (geoTargetIds?.length) {
      body.geoTargetConstants = geoTargetIds.map((id) => `geoTargetConstants/${id}`);
    }

    const response = await fetch(
      `${BASE_URL}/customers/${this.customerId}:generateKeywordIdeas`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'developer-token': tokens.developer_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new Error('Keyword idea generation failed');
    }

    const data = await response.json();

    return (data.results || []).map((r: Record<string, unknown>) => ({
      text: (r as { text: string }).text,
      avg_monthly_searches: ((r as { keywordIdeaMetrics: { avgMonthlySearches: number } }).keywordIdeaMetrics)?.avgMonthlySearches || 0,
      competition: ((r as { keywordIdeaMetrics: { competition: string } }).keywordIdeaMetrics)?.competition || 'UNSPECIFIED',
      low_top_of_page_bid_micros: ((r as { keywordIdeaMetrics: { lowTopOfPageBidMicros: number } }).keywordIdeaMetrics)?.lowTopOfPageBidMicros || 0,
      high_top_of_page_bid_micros: ((r as { keywordIdeaMetrics: { highTopOfPageBidMicros: number } }).keywordIdeaMetrics)?.highTopOfPageBidMicros || 0,
    }));
  }

  // ---- Helpers ----

  private extractErrorMessage(errorBody: Record<string, unknown>): string {
    try {
      const errors = (errorBody as { error?: { details?: Array<{ errors?: Array<{ message?: string }> }> } }).error?.details;
      if (errors?.[0]?.errors?.[0]?.message) {
        return errors[0].errors[0].message;
      }
      return JSON.stringify(errorBody).slice(0, 200);
    } catch {
      return 'Unknown API error';
    }
  }
}

// ============================================================
// Factory function
// ============================================================

/**
 * Create a GoogleAdsClient for the active account
 */
export async function createGoogleAdsClient(): Promise<GoogleAdsClient | null> {
  const { getActiveAccount } = await import('./auth');
  const account = await getActiveAccount();

  if (!account) {
    logger.warn('No active Google Ads account');
    return null;
  }

  return new GoogleAdsClient(account.id, account.customer_id);
}
