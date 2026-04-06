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
      // If payload only has campaign_id, push the full campaign from DB
      // (this is how the approval engine submits it)
      if (payload.campaign_id && !payload.name) {
        return handlePushFullCampaign(client, payload);
      }
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
    case 'push_to_google_ads':
      return handlePushFullCampaign(client, payload);
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

/**
 * Push a full campaign (with all ad groups, ads, keywords) to Google Ads
 */
async function handlePushFullCampaign(
  client: GoogleAdsClient,
  payload: Record<string, unknown>,
): Promise<MutateResultSummary> {
  const supabase = createAdminClient();
  const campaignId = payload.campaign_id as string;

  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('*').eq('id', campaignId).single();

    if (!campaign) return { success: false, error: 'Campaign not found in database' };

    // Step 1: Create campaign on Google Ads
    const campaignResults = await client.createCampaign({
      name: campaign.name,
      budget_micros: campaign.budget_amount_micros,
      channel_type: campaign.campaign_type,
      bidding_strategy: campaign.bidding_strategy,
      target_cpa_micros: campaign.target_cpa_micros,
      target_roas: campaign.target_roas,
      network_settings: campaign.network_settings,
    });

    if (!campaignResults[0]?.resource_name) {
      return { success: false, error: 'Failed to create campaign on Google Ads' };
    }

    const campaignResourceName = campaignResults[0].resource_name;
    const googleCampaignId = campaignResourceName.split('/').pop();

    // Update local campaign with Google ID
    await supabase.from('campaigns').update({
      google_campaign_id: googleCampaignId,
      status: 'active',
      last_synced_at: new Date().toISOString(),
    }).eq('id', campaignId);

    // Step 2: Create ad groups + keywords + ads
    const { data: adGroups } = await supabase
      .from('ad_groups').select('*').eq('campaign_id', campaignId).neq('status', 'removed');

    for (const ag of adGroups || []) {
      try {
        const agResults = await client.createAdGroup({
          campaign_resource_name: campaignResourceName,
          name: ag.name,
          cpc_bid_micros: ag.cpc_bid_micros,
        });

        const agResourceName = agResults[0]?.resource_name;
        if (!agResourceName) continue;

        await supabase.from('ad_groups').update({
          google_ad_group_id: agResourceName.split('/').pop(),
          status: 'active',
          last_synced_at: new Date().toISOString(),
        }).eq('id', ag.id);

        // Add keywords
        const { data: keywords } = await supabase
          .from('keywords').select('*').eq('ad_group_id', ag.id).neq('status', 'removed');

        if (keywords && keywords.length > 0) {
          await client.addKeywords(agResourceName,
            keywords.map((kw: { text: string; match_type: string; cpc_bid_micros?: number }) => ({
              text: kw.text, match_type: kw.match_type, cpc_bid_micros: kw.cpc_bid_micros,
            })),
          );
        }

        // Create ads
        const { data: ads } = await supabase
          .from('ads').select('*').eq('ad_group_id', ag.id).neq('status', 'removed');

        for (const ad of ads || []) {
          try {
            await client.createResponsiveSearchAd({
              ad_group_resource_name: agResourceName,
              headlines: ad.headlines,
              descriptions: ad.descriptions,
              final_urls: ad.final_urls,
              ...(ad.path1 ? { path1: ad.path1 } : {}),
              ...(ad.path2 ? { path2: ad.path2 } : {}),
            });
            await supabase.from('ads').update({ status: 'active', last_synced_at: new Date().toISOString() }).eq('id', ad.id);
          } catch (adErr) {
            logger.warn(`Failed to push ad ${ad.id}`, { error: (adErr as Error).message });
          }
        }
      } catch (agErr) {
        logger.warn(`Failed to push ad group ${ag.id}`, { error: (agErr as Error).message });
      }
    }

    return { success: true, google_resource_name: campaignResourceName };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Re-push ads for an existing campaign — creates new ads on Google
 * for ad groups that are already synced. Used when ad URLs or copy
 * have been updated locally and need to go live.
 */
export async function rePushAds(campaignId: string): Promise<{
  success: boolean;
  ads_pushed: number;
  errors: string[];
}> {
  const client = await createGoogleAdsClient();
  if (!client) return { success: false, ads_pushed: 0, errors: ['No Google Ads client'] };

  const supabase = createAdminClient();
  const errors: string[] = [];
  let adsPushed = 0;

  // Get ad groups that are already on Google
  const { data: adGroups } = await supabase
    .from('ad_groups')
    .select('id, name, google_ad_group_id')
    .eq('campaign_id', campaignId)
    .not('google_ad_group_id', 'is', null)
    .neq('status', 'removed');

  if (!adGroups?.length) {
    return { success: false, ads_pushed: 0, errors: ['No synced ad groups found'] };
  }

  // Get the customer ID for resource name construction
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('google_campaign_id')
    .eq('id', campaignId)
    .single();

  const { data: account } = await supabase
    .from('google_ads_accounts')
    .select('customer_id')
    .eq('is_active', true)
    .single();

  if (!account?.customer_id) {
    return { success: false, ads_pushed: 0, errors: ['No active Google Ads account'] };
  }

  for (const ag of adGroups) {
    const agResourceName = `customers/${account.customer_id}/adGroups/${ag.google_ad_group_id}`;

    // Get local ads that haven't been synced yet
    const { data: ads } = await supabase
      .from('ads')
      .select('*')
      .eq('ad_group_id', ag.id)
      .neq('status', 'removed');

    for (const ad of ads || []) {
      try {
        await client.createResponsiveSearchAd({
          ad_group_resource_name: agResourceName,
          headlines: ad.headlines,
          descriptions: ad.descriptions,
          final_urls: ad.final_urls,
          path1: ad.path1,
          path2: ad.path2,
        });
        await supabase.from('ads').update({
          status: 'active',
          last_synced_at: new Date().toISOString(),
        }).eq('id', ad.id);
        adsPushed++;
        logger.info(`Pushed ad ${ad.id} to ${ag.name}`);
      } catch (err) {
        const msg = `Ad ${ad.id} in "${ag.name}": ${(err as Error).message}`;
        errors.push(msg);
        logger.warn(`Failed to push ad`, { ad_id: ad.id, error: (err as Error).message });
      }
    }
  }

  return { success: errors.length === 0, ads_pushed: adsPushed, errors };
}
