import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { GoogleAdsClient, createGoogleAdsClient } from './client';
import { CAMPAIGN_TYPE_MAP, BIDDING_STRATEGY_MAP, STATUS_MAP } from './types';
import type { GoogleAdsPerformanceRow } from './types';

const logger = createLogger('GoogleAdsSync');

// ============================================================
// Sync Engine — Bidirectional data synchronization
// ============================================================

/**
 * Sync performance data from Google Ads to local database
 * Called by the cron job every 6 hours
 */
export async function syncPerformanceData(lookbackDays = 7): Promise<{
  campaigns_synced: number;
  snapshots_upserted: number;
}> {
  const client = await createGoogleAdsClient();
  if (!client) {
    logger.warn('No Google Ads client available, skipping sync');
    return { campaigns_synced: 0, snapshots_upserted: 0 };
  }

  const supabase = createAdminClient();
  const dateTo = new Date().toISOString().split('T')[0];
  const dateFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  logger.info(`Syncing performance data from ${dateFrom} to ${dateTo}`);

  // Get campaign performance
  const performanceRows = await client.getCampaignPerformance(dateFrom, dateTo);

  // Map Google campaign IDs to local campaign IDs
  const { data: localCampaigns } = await supabase
    .from('campaigns')
    .select('id, google_campaign_id')
    .not('google_campaign_id', 'is', null);

  const campaignIdMap = new Map(
    (localCampaigns || []).map((c: { id: string; google_campaign_id: string }) => [
      c.google_campaign_id,
      c.id,
    ]),
  );

  let snapshotsUpserted = 0;
  const campaignsSynced = new Set<string>();

  for (const row of performanceRows) {
    const localCampaignId = campaignIdMap.get(row.campaign_id!);
    if (!localCampaignId) continue;

    campaignsSynced.add(row.campaign_id!);

    const snapshot = {
      entity_type: 'campaign' as const,
      entity_id: localCampaignId,
      google_entity_id: row.campaign_id,
      date: row.date,
      impressions: parseInt(row.metrics.impressions) || 0,
      clicks: parseInt(row.metrics.clicks) || 0,
      cost_micros: parseInt(row.metrics.cost_micros) || 0,
      conversions: parseFloat(row.metrics.conversions) || 0,
      conversion_value_micros: parseInt(row.metrics.conversions_value) || 0,
      ctr: parseFloat(row.metrics.ctr) || 0,
      avg_cpc_micros: parseInt(row.metrics.average_cpc) || 0,
      search_impression_share: row.metrics.search_impression_share
        ? parseFloat(row.metrics.search_impression_share)
        : null,
    };

    const { error } = await supabase
      .from('performance_snapshots')
      .upsert(snapshot, {
        onConflict: 'entity_type,entity_id,date',
      });

    if (error) {
      logger.error(`Failed to upsert snapshot`, { error: error.message });
    } else {
      snapshotsUpserted++;
    }
  }

  // Update last_synced_at
  if (campaignsSynced.size > 0) {
    const now = new Date().toISOString();
    for (const googleCampaignId of campaignsSynced) {
      const localId = campaignIdMap.get(googleCampaignId);
      if (localId) {
        await supabase
          .from('campaigns')
          .update({ last_synced_at: now })
          .eq('id', localId);
      }
    }

    // Update account last_synced_at
    await supabase
      .from('google_ads_accounts')
      .update({ last_synced_at: now })
      .eq('is_active', true);
  }

  logger.info(`Sync complete: ${campaignsSynced.size} campaigns, ${snapshotsUpserted} snapshots`);

  return {
    campaigns_synced: campaignsSynced.size,
    snapshots_upserted: snapshotsUpserted,
  };
}

/**
 * Import campaigns from Google Ads that don't exist locally
 */
export async function importCampaignsFromGoogle(): Promise<number> {
  const client = await createGoogleAdsClient();
  if (!client) return 0;

  const supabase = createAdminClient();

  // Get active account
  const { data: account } = await supabase
    .from('google_ads_accounts')
    .select('id')
    .eq('is_active', true)
    .single();

  if (!account) return 0;

  // Get all campaigns from Google
  const googleCampaigns = await client.getCampaigns();

  // Get existing local campaign google IDs
  const { data: localCampaigns } = await supabase
    .from('campaigns')
    .select('google_campaign_id')
    .not('google_campaign_id', 'is', null);

  const existingIds = new Set(
    (localCampaigns || []).map((c: { google_campaign_id: string }) => c.google_campaign_id),
  );

  let imported = 0;

  for (const gc of googleCampaigns) {
    if (existingIds.has(gc.id)) continue;

    const localStatus = STATUS_MAP.fromGoogle[gc.status] || 'paused';
    const campaignType = CAMPAIGN_TYPE_MAP.fromGoogle[gc.advertising_channel_type] || 'SEARCH';
    const biddingStrategy = BIDDING_STRATEGY_MAP.fromGoogle[gc.bidding_strategy_type] || 'MAXIMIZE_CLICKS';

    const { error } = await supabase.from('campaigns').insert({
      google_ads_account_id: account.id,
      google_campaign_id: gc.id,
      name: gc.name,
      campaign_type: campaignType,
      status: localStatus,
      budget_amount_micros: 0, // Will be updated from budget resource
      bidding_strategy: biddingStrategy,
      target_cpa_micros: gc.target_cpa?.target_cpa_micros
        ? parseInt(gc.target_cpa.target_cpa_micros)
        : null,
      target_roas: gc.target_roas?.target_roas || null,
      network_settings: gc.network_settings
        ? {
            search: gc.network_settings.target_google_search,
            display: gc.network_settings.target_content_network,
            partners: gc.network_settings.target_search_network,
          }
        : { search: true, display: false, partners: false },
      start_date: gc.start_date || null,
      end_date: gc.end_date || null,
      last_synced_at: new Date().toISOString(),
    });

    if (!error) imported++;
  }

  logger.info(`Imported ${imported} campaigns from Google Ads`);
  return imported;
}

/**
 * Push an approved local change to Google Ads
 * Called by the ApprovalEngine when an item is applied
 */
export async function pushChangeToGoogle(
  actionType: string,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  const client = await createGoogleAdsClient();
  if (!client) {
    throw new Error('No Google Ads client available');
  }

  logger.info(`Pushing change to Google: ${actionType}`);

  switch (actionType) {
    case 'create_campaign':
      return handleCreateCampaign(client, payload);
    case 'update_campaign_status':
      return handleUpdateCampaignStatus(client, payload);
    case 'update_bid':
      return handleUpdateBid(client, payload);
    case 'create_ad_group':
      return handleCreateAdGroup(client, payload);
    case 'create_ad':
      return handleCreateAd(client, payload);
    case 'add_keywords':
      return handleAddKeywords(client, payload);
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

interface MutateResultSummary {
  success: boolean;
  google_resource_name?: string;
  error?: string;
}

async function handleCreateCampaign(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  try {
    const results = await client.createCampaign({
      name: payload.name as string,
      budget_micros: payload.budget_amount_micros as number,
      channel_type: payload.campaign_type as string,
      bidding_strategy: payload.bidding_strategy as string,
      target_cpa_micros: payload.target_cpa_micros as number | undefined,
      target_roas: payload.target_roas as number | undefined,
      network_settings: payload.network_settings as { search: boolean; display: boolean; partners: boolean } | undefined,
    });

    return {
      success: true,
      google_resource_name: results[0]?.resource_name,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handleUpdateCampaignStatus(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  try {
    const results = await client.updateCampaignStatus(
      payload.resource_name as string,
      payload.status as 'ENABLED' | 'PAUSED' | 'REMOVED',
    );
    return { success: true, google_resource_name: results[0]?.resource_name };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleUpdateBid(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  try {
    const results = await client.updateKeywordBid(
      payload.resource_name as string,
      payload.new_bid_micros as number,
    );
    return { success: true, google_resource_name: results[0]?.resource_name };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleCreateAdGroup(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  try {
    const results = await client.createAdGroup({
      campaign_resource_name: payload.campaign_resource_name as string,
      name: payload.name as string,
      cpc_bid_micros: payload.cpc_bid_micros as number | undefined,
    });
    return { success: true, google_resource_name: results[0]?.resource_name };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleCreateAd(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  try {
    const results = await client.createResponsiveSearchAd({
      ad_group_resource_name: payload.ad_group_resource_name as string,
      headlines: payload.headlines as Array<{ text: string }>,
      descriptions: payload.descriptions as Array<{ text: string }>,
      final_urls: payload.final_urls as string[],
      path1: payload.path1 as string | undefined,
      path2: payload.path2 as string | undefined,
    });
    return { success: true, google_resource_name: results[0]?.resource_name };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleAddKeywords(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  try {
    const results = await client.addKeywords(
      payload.ad_group_resource_name as string,
      payload.keywords as Array<{ text: string; match_type: string; cpc_bid_micros?: number }>,
    );
    return {
      success: results.every((r) => r.success),
      google_resource_name: results[0]?.resource_name,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
