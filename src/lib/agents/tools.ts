import type Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { comprehensiveKeywordResearch, getCompetitors, getRelatedKeywords } from '../dataforseo';
import { searchImages } from '../unsplash';
import { createGoogleAdsClient } from '../google-ads/client';
import { qaSentinel } from './qa-sentinel';

const logger = createLogger('Tools');

// ============================================================
// Tool Definitions — input_schema for Anthropic tool_use API
// ============================================================

export type ToolName =
  | 'ask_user_questions'
  | 'research_keywords'
  | 'analyze_competitors'
  | 'create_campaign'
  | 'create_ad_group'
  | 'create_ad'
  | 'build_tracking_urls'
  | 'search_images'
  | 'validate_campaign'
  | 'submit_for_approval'
  | 'get_campaign_performance';

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'ask_user_questions',
    description: 'Ask the user 1-3 related questions when you need information to proceed. Group related questions together. Only ask what you cannot infer from context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of 1-3 related questions to ask the user',
        },
        context: {
          type: 'string',
          description: 'Brief context for why you are asking these questions',
        },
      },
      required: ['questions'],
    },
  },
  {
    name: 'research_keywords',
    description: 'Research keywords using DataForSEO and Google Ads Keyword Planner. Returns search volume, competition, CPC, and related keywords.',
    input_schema: {
      type: 'object' as const,
      properties: {
        seed_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Seed keywords to research',
        },
        business_description: {
          type: 'string',
          description: 'Description of the business/service being advertised',
        },
        location_code: {
          type: 'number',
          description: 'DataForSEO location code (2840 = US, 2826 = UK, 2784 = UAE). Default: 2840',
        },
      },
      required: ['seed_keywords', 'business_description'],
    },
  },
  {
    name: 'analyze_competitors',
    description: 'Analyze competitor domains — their SERP presence, keywords they rank for, and ad strategies.',
    input_schema: {
      type: 'object' as const,
      properties: {
        competitor_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Competitor domain names to analyze',
        },
        seed_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords to check competitor presence for',
        },
      },
      required: ['seed_keywords'],
    },
  },
  {
    name: 'create_campaign',
    description: 'Create a new campaign in the local database. Campaign starts in draft status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        campaign_type: {
          type: 'string',
          enum: ['SEARCH', 'DISPLAY', 'PERFORMANCE_MAX', 'VIDEO', 'DEMAND_GEN', 'SHOPPING'],
        },
        daily_budget_dollars: { type: 'number', description: 'Daily budget in dollars' },
        bidding_strategy: {
          type: 'string',
          enum: ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'TARGET_ROAS', 'MANUAL_CPC', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_IMPRESSION_SHARE'],
        },
        geo_targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target locations (e.g. "United States", "California", "New York")',
        },
        language_targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target languages (e.g. "en", "es")',
        },
      },
      required: ['name', 'campaign_type', 'daily_budget_dollars', 'bidding_strategy'],
    },
  },
  {
    name: 'create_ad_group',
    description: 'Create an ad group within a campaign, with keywords and optional negative keywords.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the parent campaign' },
        name: { type: 'string', description: 'Ad group name (theme-based)' },
        cpc_bid_micros: { type: 'number', description: 'Default CPC bid in micros (1000000 = $1)' },
        keywords: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              match_type: { type: 'string', enum: ['BROAD', 'PHRASE', 'EXACT'] },
            },
            required: ['text', 'match_type'],
          },
          description: 'Keywords for this ad group',
        },
        negative_keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Negative keywords for this ad group',
        },
      },
      required: ['campaign_id', 'name', 'keywords'],
    },
  },
  {
    name: 'create_ad',
    description: 'Create a responsive search ad for an ad group. Headlines max 30 chars, descriptions max 90 chars.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_group_id: { type: 'string', description: 'UUID of the parent ad group' },
        headlines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Headline text (max 30 characters)' },
              pinned_position: { type: 'number', description: 'Pin to position 1-4 (optional)' },
            },
            required: ['text'],
          },
          description: '3-15 headlines, each max 30 characters',
        },
        descriptions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Description text (max 90 characters)' },
            },
            required: ['text'],
          },
          description: '2-4 descriptions, each max 90 characters',
        },
        final_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Landing page URLs',
        },
        path1: { type: 'string', description: 'Display URL path 1 (max 15 chars)' },
        path2: { type: 'string', description: 'Display URL path 2 (max 15 chars)' },
      },
      required: ['ad_group_id', 'headlines', 'descriptions', 'final_urls'],
    },
  },
  {
    name: 'build_tracking_urls',
    description: 'Build tracking URLs with UTM parameters and ICP (persona) parameters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        base_url: { type: 'string', description: 'Base landing page URL' },
        campaign_name: { type: 'string', description: 'Campaign name for utm_campaign' },
        persona: { type: 'string', description: 'ICP persona (e.g. "cio", "cto", "vp_engineering")' },
        custom_params: {
          type: 'object',
          description: 'Additional custom URL parameters',
        },
      },
      required: ['base_url', 'campaign_name'],
    },
  },
  {
    name: 'search_images',
    description: 'Search Unsplash for relevant high-quality images for ads.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Image search query' },
        count: { type: 'number', description: 'Number of images to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'validate_campaign',
    description: 'Run QA validation checks on a campaign — budget limits, character counts, keyword conflicts, structural completeness.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the campaign to validate' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'submit_for_approval',
    description: 'Submit a validated campaign to the approval queue for user review.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the campaign to submit' },
        reasoning: { type: 'string', description: 'Explanation of why this campaign is structured this way' },
      },
      required: ['campaign_id', 'reasoning'],
    },
  },
  {
    name: 'get_campaign_performance',
    description: 'Get performance metrics for campaigns — impressions, clicks, cost, conversions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Specific campaign UUID (omit for all campaigns)' },
        days: { type: 'number', description: 'Number of days to look back (default 30)' },
      },
    },
  },
];

// ============================================================
// Tool Handlers — execute the actual work
// ============================================================

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<{ result: string; data?: unknown }> {
  const supabase = createAdminClient();

  switch (name) {
    // ---- ASK USER ----
    case 'ask_user_questions': {
      // This is handled specially by the harness — it pauses and returns
      return { result: 'PAUSE_FOR_USER', data: input };
    }

    // ---- RESEARCH KEYWORDS ----
    case 'research_keywords': {
      const keywords = (input.seed_keywords as string[]) || [];
      const location = (input.location_code as number) || 2840;

      logger.info('Researching keywords', { count: keywords.length });

      const results = [];
      for (const kw of keywords.slice(0, 5)) {
        try {
          const data = await comprehensiveKeywordResearch(kw, location);
          results.push(data);
        } catch (e) {
          logger.warn(`Research failed for "${kw}"`, { error: (e as Error).message });
        }
      }

      // Also try Google Ads Keyword Planner
      let googleKeywords: unknown[] = [];
      try {
        const client = await createGoogleAdsClient();
        if (client) {
          googleKeywords = await client.generateKeywordIdeas(keywords.slice(0, 10));
        }
      } catch {
        // Google Ads not connected — that's fine
      }

      // Store in cache
      try {
        await supabase.from('keyword_research').insert({
          query: keywords.join(', '),
          results: { dataforseo: results, google_ads: googleKeywords } as unknown as Record<string, unknown>,
          source: 'harness_research',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch { /* non-critical cache write */ }

      const totalKeywords = results.reduce((sum, r) => sum + (r.related?.length || 0), 0);
      const summary = `Found ${totalKeywords} related keywords across ${results.length} seed terms. Google Ads Planner returned ${googleKeywords.length} additional ideas.`;

      return { result: summary, data: { dataforseo: results, google_ads: googleKeywords } };
    }

    // ---- ANALYZE COMPETITORS ----
    case 'analyze_competitors': {
      const seedKeywords = (input.seed_keywords as string[]) || [];
      const domains = (input.competitor_domains as string[]) || [];

      logger.info('Analyzing competitors', { keywords: seedKeywords.length, domains: domains.length });

      const competitorData = [];
      for (const kw of seedKeywords.slice(0, 3)) {
        try {
          const serp = await getCompetitors(kw);
          competitorData.push({ keyword: kw, competitors: serp });
        } catch {
          // skip
        }
      }

      // Store competitor data
      const uniqueDomains = new Set<string>();
      for (const result of competitorData) {
        for (const comp of result.competitors) {
          if (comp.domain && !uniqueDomains.has(comp.domain)) {
            uniqueDomains.add(comp.domain);
            try {
              await supabase.from('competitor_data').upsert({
                domain: comp.domain,
                company_name: comp.title,
                notes: `Ranks for: ${result.keyword}`,
              }, { onConflict: 'domain' });
            } catch { /* non-critical */ }
          }
        }
      }

      return {
        result: `Analyzed SERP for ${seedKeywords.length} keywords. Found ${uniqueDomains.size} competitors.`,
        data: competitorData,
      };
    }

    // ---- CREATE CAMPAIGN ----
    case 'create_campaign': {
      // Get active Google Ads account
      const { data: account } = await supabase
        .from('google_ads_accounts')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!account) {
        return { result: 'Error: No Google Ads account connected. Please connect one in Settings.' };
      }

      const budgetMicros = Math.round((input.daily_budget_dollars as number) * 1_000_000);

      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          google_ads_account_id: account.id,
          name: input.name as string,
          campaign_type: input.campaign_type as string,
          status: 'draft',
          budget_amount_micros: budgetMicros,
          bidding_strategy: input.bidding_strategy as string,
          geo_targets: ((input.geo_targets as string[]) || []).map((g) => ({ country: g })),
          language_targets: (input.language_targets as string[]) || ['en'],
          network_settings: { search: true, display: false, partners: false },
        })
        .select()
        .single();

      if (error) return { result: `Error creating campaign: ${error.message}` };

      return {
        result: `Campaign "${input.name}" created (ID: ${campaign.id}). Budget: $${input.daily_budget_dollars}/day. Type: ${input.campaign_type}. Status: draft.`,
        data: { campaign_id: campaign.id },
      };
    }

    // ---- CREATE AD GROUP ----
    case 'create_ad_group': {
      const { data: adGroup, error: agError } = await supabase
        .from('ad_groups')
        .insert({
          campaign_id: input.campaign_id as string,
          name: input.name as string,
          status: 'draft',
          cpc_bid_micros: input.cpc_bid_micros as number || null,
        })
        .select()
        .single();

      if (agError) return { result: `Error creating ad group: ${agError.message}` };

      // Add keywords — handle various shapes the AI might send
      let keywords: Array<{ text: string; match_type: string }> = [];
      if (Array.isArray(input.keywords)) {
        keywords = input.keywords.map((kw: unknown) => {
          if (typeof kw === 'string') return { text: kw, match_type: 'BROAD' };
          if (typeof kw === 'object' && kw !== null) {
            const k = kw as Record<string, unknown>;
            return { text: String(k.text || k.keyword || ''), match_type: String(k.match_type || k.matchType || 'BROAD') };
          }
          return { text: String(kw), match_type: 'BROAD' };
        }).filter((kw) => kw.text.length > 0);
      }

      if (keywords.length > 0) {
        await supabase.from('keywords').insert(
          keywords.map((kw) => ({
            ad_group_id: adGroup.id,
            text: kw.text,
            match_type: kw.match_type,
            status: 'draft',
          })),
        );
      }

      // Add negative keywords — handle string or array
      let negKeywords: string[] = [];
      if (Array.isArray(input.negative_keywords)) {
        negKeywords = input.negative_keywords.map((nk: unknown) => String(nk)).filter(Boolean);
      }
      if (negKeywords.length > 0) {
        await supabase.from('negative_keywords').insert(
          negKeywords.map((text) => ({
            ad_group_id: adGroup.id,
            text,
            match_type: 'PHRASE',
            level: 'ad_group',
          })),
        );
      }

      return {
        result: `Ad group "${input.name}" created with ${keywords.length} keywords and ${negKeywords.length} negative keywords.`,
        data: { ad_group_id: adGroup.id },
      };
    }

    // ---- CREATE AD ----
    case 'create_ad': {
      // Normalize headlines — handle strings, objects, mixed
      const rawHeadlines = Array.isArray(input.headlines) ? input.headlines : [];
      const headlines = rawHeadlines.map((h: unknown) => {
        if (typeof h === 'string') return { text: h };
        if (typeof h === 'object' && h !== null) {
          const obj = h as Record<string, unknown>;
          return { text: String(obj.text || obj.headline || ''), pinned_position: obj.pinned_position as number | undefined };
        }
        return { text: String(h) };
      }).filter((h) => h.text.length > 0);

      const rawDescriptions = Array.isArray(input.descriptions) ? input.descriptions : [];
      const descriptions = rawDescriptions.map((d: unknown) => {
        if (typeof d === 'string') return { text: d };
        if (typeof d === 'object' && d !== null) {
          const obj = d as Record<string, unknown>;
          return { text: String(obj.text || obj.description || '') };
        }
        return { text: String(d) };
      }).filter((d) => d.text.length > 0);

      const finalUrls = Array.isArray(input.final_urls)
        ? input.final_urls.map((u: unknown) => String(u)).filter(Boolean)
        : typeof input.final_urls === 'string' ? [input.final_urls] : [];

      // Validate via QA
      const qaResult = qaSentinel.validateAdCopySync({
        headlines,
        descriptions,
        final_urls: finalUrls,
        path1: input.path1 as string,
        path2: input.path2 as string,
      });

      if (!qaResult.passed) {
        const issues = qaResult.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
        return { result: `QA validation failed: ${issues}. Please fix and try again.` };
      }

      const { data: ad, error } = await supabase
        .from('ads')
        .insert({
          ad_group_id: input.ad_group_id as string,
          ad_type: 'RESPONSIVE_SEARCH',
          headlines,
          descriptions,
          final_urls: finalUrls,
          path1: (input.path1 as string) || null,
          path2: (input.path2 as string) || null,
          status: 'draft',
        })
        .select()
        .single();

      if (error) return { result: `Error creating ad: ${error.message}` };

      const warnings = qaResult.warnings.length > 0
        ? ` Warnings: ${qaResult.warnings.map((w) => w.message).join('; ')}`
        : '';

      return {
        result: `Ad created with ${headlines.length} headlines and ${descriptions.length} descriptions. QA passed.${warnings}`,
        data: { ad_id: ad.id },
      };
    }

    // ---- BUILD TRACKING URLS ----
    case 'build_tracking_urls': {
      const baseUrl = (input.base_url as string).split('?')[0];
      const campaignSlug = (input.campaign_name as string)
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      const params = new URLSearchParams({
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: campaignSlug,
      });

      if (input.persona) params.set('icp', input.persona as string);

      const customParams = input.custom_params as Record<string, string> | undefined;
      if (customParams) {
        for (const [k, v] of Object.entries(customParams)) {
          params.set(k, v);
        }
      }

      const fullUrl = `${baseUrl}?${params.toString()}`;
      return {
        result: `Tracking URL built: ${fullUrl}`,
        data: { url: fullUrl, base_url: baseUrl, params: Object.fromEntries(params) },
      };
    }

    // ---- SEARCH IMAGES ----
    case 'search_images': {
      const images = await searchImages(
        input.query as string,
        (input.count as number) || 5,
      );

      return {
        result: `Found ${images.length} images for "${input.query}".`,
        data: images,
      };
    }

    // ---- VALIDATE CAMPAIGN ----
    case 'validate_campaign': {
      const campaignId = input.campaign_id as string;

      // Fetch full campaign with nested entities
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (!campaign) return { result: `Campaign ${campaignId} not found.` };

      const { data: adGroups } = await supabase
        .from('ad_groups').select('*').eq('campaign_id', campaignId);
      const agIds = (adGroups || []).map((ag: { id: string }) => ag.id);

      let ads: Array<{ ad_group_id: string; headlines: Array<{ text: string }>; descriptions: Array<{ text: string }>; final_urls: string[] }> = [];
      let keywords: Array<{ ad_group_id: string; text: string; match_type: string }> = [];

      if (agIds.length > 0) {
        const [adsRes, kwRes] = await Promise.all([
          supabase.from('ads').select('*').in('ad_group_id', agIds),
          supabase.from('keywords').select('*').in('ad_group_id', agIds),
        ]);
        ads = adsRes.data || [];
        keywords = kwRes.data || [];
      }

      // Build blueprint shape for QA
      const blueprint = {
        campaign: {
          name: campaign.name,
          campaign_type: campaign.campaign_type,
          budget_amount_micros: campaign.budget_amount_micros,
          bidding_strategy: campaign.bidding_strategy,
          geo_targets: campaign.geo_targets || [],
          language_targets: campaign.language_targets || [],
          network_settings: campaign.network_settings || { search: true, display: false, partners: false },
        },
        ad_groups: (adGroups || []).map((ag: { id: string; name: string }) => ({
          name: ag.name,
          ads: ads.filter((a) => a.ad_group_id === ag.id).map((a) => ({
            headlines: a.headlines,
            descriptions: a.descriptions,
            final_urls: a.final_urls,
          })),
          keywords: keywords.filter((k) => k.ad_group_id === ag.id).map((k) => ({
            text: k.text,
            match_type: k.match_type,
          })),
        })),
        reasoning: '',
      };

      const qaResult = await qaSentinel.validateCampaignBlueprint(blueprint as any);

      if (qaResult.passed) {
        const warnText = qaResult.warnings.length > 0
          ? ` Warnings: ${qaResult.warnings.map((w) => w.message).join('; ')}`
          : '';
        return { result: `Campaign validation PASSED.${warnText}`, data: qaResult };
      } else {
        const issues = qaResult.errors.map((e) => `${e.field}: ${e.message}`).join('\n');
        return { result: `Campaign validation FAILED:\n${issues}`, data: qaResult };
      }
    }

    // ---- SUBMIT FOR APPROVAL ----
    case 'submit_for_approval': {
      const { approvalEngine } = await import('../approval-engine');

      const approval = await approvalEngine.enqueue({
        action_type: 'create_campaign',
        entity_type: 'campaign',
        entity_id: input.campaign_id as string,
        payload: { campaign_id: input.campaign_id },
        ai_reasoning: input.reasoning as string,
        confidence_score: 0.9,
        priority: 'normal',
        agent_name: 'CampaignHarness',
      });

      return {
        result: `Campaign submitted for approval (ID: ${approval.id}). Go to the Approvals page to review and approve.`,
        data: { approval_id: approval.id },
      };
    }

    // ---- GET PERFORMANCE ----
    case 'get_campaign_performance': {
      const days = (input.days as number) || 30;
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let query = supabase
        .from('performance_snapshots')
        .select('*')
        .eq('entity_type', 'campaign')
        .gte('date', dateFrom);

      if (input.campaign_id) {
        query = query.eq('entity_id', input.campaign_id as string);
      }

      const { data } = await query;

      if (!data || data.length === 0) {
        return { result: 'No performance data available. Sync your Google Ads data first.' };
      }

      const totals = data.reduce(
        (acc, row) => ({
          impressions: acc.impressions + (row.impressions || 0),
          clicks: acc.clicks + (row.clicks || 0),
          cost_micros: acc.cost_micros + (row.cost_micros || 0),
          conversions: acc.conversions + (row.conversions || 0),
        }),
        { impressions: 0, clicks: 0, cost_micros: 0, conversions: 0 },
      );

      const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0';
      const spend = (totals.cost_micros / 1_000_000).toFixed(2);

      return {
        result: `Last ${days} days: ${totals.impressions.toLocaleString()} impressions, ${totals.clicks.toLocaleString()} clicks, $${spend} spend, ${totals.conversions} conversions, ${ctr}% CTR.`,
        data: totals,
      };
    }

    default:
      return { result: `Unknown tool: ${name}` };
  }
}

// ============================================================
// Stage-specific tool filtering
// ============================================================

export type PipelineStage = 'gather' | 'research' | 'strategy' | 'build' | 'present' | 'edit' | 'approve' | 'standalone';

export function getToolsForStage(stage: PipelineStage): Anthropic.Tool[] {
  const toolsByStage: Record<PipelineStage, ToolName[]> = {
    gather: ['ask_user_questions'],
    research: ['research_keywords', 'analyze_competitors'],
    strategy: [], // No tools — AI reasons with accumulated context
    build: ['create_campaign', 'create_ad_group', 'create_ad', 'build_tracking_urls', 'search_images'],
    present: ['validate_campaign'],
    edit: ['create_ad_group', 'create_ad', 'build_tracking_urls'],
    approve: ['validate_campaign', 'submit_for_approval'],
    standalone: TOOL_DEFINITIONS.map((t) => t.name as ToolName), // All tools
  };

  const allowedNames = toolsByStage[stage] || [];
  return TOOL_DEFINITIONS.filter((t) => allowedNames.includes(t.name as ToolName));
}
