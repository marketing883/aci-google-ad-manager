import type Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { comprehensiveKeywordResearch, getCompetitors, getRelatedKeywords, getSerpAdvanced, type ComprehensiveKeywordData } from '../dataforseo';
import { checkLlmVisibility } from '../llm-visibility';
import { scoreOrganic, scoreAiOverview, scorePaid, scoreLlm, scoreWebsiteHealth, calculateOverallScore, selectRecommendations, THRESHOLDS } from '../visibility-recommendations';
import { getTrafficOverview, getLandingPagePerformance, getAcquisitionChannels, getAdTrafficBehavior, getDeviceBreakdown, getConversionEvents } from '../google-analytics/client';
import { searchImages } from '../unsplash';
import { createGoogleAdsClient } from '../google-ads/client';
import { syncPerformanceData, rePushAds, importCampaignsFromGoogle } from '../google-ads/sync';
import { qaSentinel } from './qa-sentinel';

const logger = createLogger('Tools');

/** Extract brand name from domain + SERP title */
function extractBrandName(domain: string, title: string): string {
  // Common patterns: snowflake.com → Snowflake, aws.amazon.com → AWS
  const domainParts = domain.replace(/^www\./, '').split('.');
  const base = domainParts[0];

  // If title starts with a recognizable brand, use that
  const titleFirstWord = title.split(/[\s\-–|:]/)[0].trim();
  if (titleFirstWord.length >= 2 && titleFirstWord.length <= 30) {
    return titleFirstWord;
  }

  // Capitalize domain base
  return base.charAt(0).toUpperCase() + base.slice(1);
}

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
  | 'update_campaign'
  | 'update_ad_group'
  | 'update_ad'
  | 'delete_ad_group'
  | 'delete_ad'
  | 'build_tracking_urls'
  | 'search_images'
  | 'validate_campaign'
  | 'submit_for_approval'
  | 'get_campaign_performance'
  | 'analyze_performance'
  | 'find_waste'
  | 'suggest_opportunities'
  | 'send_report'
  | 'schedule_report'
  | 'manage_report_schedules'
  | 'get_company_context'
  | 'sync_google_performance'
  | 'push_campaign_to_google'
  | 'toggle_campaign_status'
  | 'check_google_ads_status'
  | 'import_google_campaigns'
  | 'get_google_ads_details'
  | 'brand_visibility_report'
  | 'get_analytics_intelligence'
  | 'get_website_health';

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
    name: 'update_campaign',
    description: 'Update an existing campaign — change name, budget, bidding strategy, targets, or status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the campaign to update' },
        name: { type: 'string', description: 'New campaign name' },
        daily_budget_dollars: { type: 'number', description: 'New daily budget in dollars' },
        bidding_strategy: {
          type: 'string',
          enum: ['MAXIMIZE_CLICKS', 'MAXIMIZE_CONVERSIONS', 'TARGET_CPA', 'TARGET_ROAS', 'MANUAL_CPC', 'MAXIMIZE_CONVERSION_VALUE', 'TARGET_IMPRESSION_SHARE'],
        },
        geo_targets: { type: 'array', items: { type: 'string' }, description: 'New target locations' },
        status: { type: 'string', enum: ['draft', 'active', 'paused'], description: 'New campaign status' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'update_ad_group',
    description: 'Update an existing ad group — change name, bid, or status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_group_id: { type: 'string', description: 'UUID of the ad group to update' },
        name: { type: 'string', description: 'New ad group name' },
        cpc_bid_micros: { type: 'number', description: 'New CPC bid in micros (1000000 = $1)' },
        status: { type: 'string', enum: ['draft', 'active', 'paused'], description: 'New status' },
      },
      required: ['ad_group_id'],
    },
  },
  {
    name: 'update_ad',
    description: 'Update an existing ad — change headlines, descriptions, URLs, or status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'UUID of the ad to update' },
        headlines: {
          type: 'array',
          items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          description: 'New headlines (max 30 chars each)',
        },
        descriptions: {
          type: 'array',
          items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          description: 'New descriptions (max 90 chars each)',
        },
        final_urls: { type: 'array', items: { type: 'string' }, description: 'New landing page URLs' },
        path1: { type: 'string', description: 'New display URL path 1 (max 15 chars)' },
        path2: { type: 'string', description: 'New display URL path 2 (max 15 chars)' },
        status: { type: 'string', enum: ['draft', 'active', 'paused'], description: 'New status' },
      },
      required: ['ad_id'],
    },
  },
  {
    name: 'delete_ad_group',
    description: 'Delete an ad group and all its ads and keywords. This is a soft delete (sets status to removed).',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_group_id: { type: 'string', description: 'UUID of the ad group to delete' },
      },
      required: ['ad_group_id'],
    },
  },
  {
    name: 'delete_ad',
    description: 'Delete a specific ad from an ad group. This is a soft delete (sets status to removed).',
    input_schema: {
      type: 'object' as const,
      properties: {
        ad_id: { type: 'string', description: 'UUID of the ad to delete' },
      },
      required: ['ad_id'],
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
  {
    name: 'analyze_performance',
    description: 'Deep performance analysis — find root causes for CPA spikes, CTR drops, conversion changes. Analyzes trends and compares periods.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Specific campaign to analyze (omit for portfolio-wide)' },
        question: { type: 'string', description: 'Specific question to investigate, e.g. "why did CPA spike yesterday?"' },
        compare_periods: { type: 'boolean', description: 'Compare last 7 days vs previous 7 days' },
      },
    },
  },
  {
    name: 'find_waste',
    description: 'Identify wasted ad spend — keywords with spend but no conversions, campaigns with poor ROI, underperforming ad groups.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Look-back period in days (default 30)' },
        min_spend_dollars: { type: 'number', description: 'Minimum spend threshold to flag (default $10)' },
      },
    },
  },
  {
    name: 'suggest_opportunities',
    description: 'Find growth opportunities — keywords with high intent and low competition, underinvested campaigns, geographic gaps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        focus_area: { type: 'string', description: 'Focus on: keywords, audiences, geography, budget, or all' },
      },
    },
  },
  {
    name: 'send_report',
    description: 'Generate and send a report via email right now.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipients: { type: 'array', items: { type: 'string' }, description: 'Email addresses to send to' },
        report_type: { type: 'string', enum: ['performance', 'competitor', 'briefing'], description: 'Type of report' },
        period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period (default: week)' },
        subject: { type: 'string', description: 'Email subject line' },
      },
      required: ['recipients', 'report_type'],
    },
  },
  {
    name: 'schedule_report',
    description: 'Set up a recurring automated report that gets emailed on a schedule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Schedule name, e.g. "Weekly Performance Report"' },
        recipients: { type: 'array', items: { type: 'string' }, description: 'Email addresses' },
        frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'How often' },
        day_of_week: { type: 'number', description: '1=Monday to 7=Sunday (for weekly)' },
        time: { type: 'string', description: 'Time to send, e.g. "09:00"' },
        report_type: { type: 'string', enum: ['performance', 'competitor', 'briefing'], description: 'What kind of report' },
      },
      required: ['name', 'recipients', 'frequency', 'report_type'],
    },
  },
  {
    name: 'manage_report_schedules',
    description: 'List, pause, resume, or delete scheduled report emails.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['list', 'pause', 'resume', 'delete'], description: 'What to do' },
        schedule_id: { type: 'string', description: 'UUID of the schedule (for pause/resume/delete)' },
      },
      required: ['action'],
    },
  },
  // ---- COMPANY CONTEXT ----
  {
    name: 'get_company_context',
    description: 'Retrieve the company profile — services, USPs, landing pages, competitors, brand terms, and default settings. Call this when creating campaigns, writing ad copy, or building strategy. Do NOT call for analytics, reports, or performance queries.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // ---- GOOGLE ADS SYNC ----
  {
    name: 'sync_google_performance',
    description: 'Pull fresh performance data from Google Ads into the local database. Call this when the user asks for up-to-date metrics, before analyzing performance, or when data seems stale. Returns the number of campaigns synced and performance snapshots updated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Number of days of data to sync (default 7, max 90)' },
      },
      required: [],
    },
  },
  {
    name: 'push_campaign_to_google',
    description: 'Push a local campaign to Google Ads. Use "full_push" to push the entire campaign (budget, ad groups, keywords, ads) for the first time. Use "push_ads_only" to re-push ads when URLs or copy have been updated. Campaigns are created as PAUSED on Google.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the campaign to push' },
        action: { type: 'string', enum: ['full_push', 'push_ads_only'], description: 'full_push for first-time push, push_ads_only to update ads on existing campaign' },
      },
      required: ['campaign_id', 'action'],
    },
  },
  {
    name: 'toggle_campaign_status',
    description: 'Enable or pause a campaign on Google Ads. Use this when the user wants to go live, pause a running campaign, or resume a paused one. The campaign must already be on Google Ads (pushed).',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the local campaign' },
        status: { type: 'string', enum: ['enable', 'pause'], description: 'enable to go live, pause to stop' },
      },
      required: ['campaign_id', 'status'],
    },
  },
  {
    name: 'check_google_ads_status',
    description: 'Check the Google Ads connection status and which campaigns are synced to Google. Shows Google campaign IDs, sync status, and whether campaigns are live or paused. Call this when the user asks "what\'s on Google?" or "is my campaign live?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'Optional — check a specific campaign. If omitted, shows all campaigns.' },
      },
      required: [],
    },
  },
  {
    name: 'import_google_campaigns',
    description: 'Import existing campaigns from Google Ads into the local database. Use when the user has campaigns already running on Google that aren\'t in the system yet. Only imports campaigns that don\'t already exist locally.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_google_ads_details',
    description: 'Get detailed live performance data from Google Ads at the ad group or keyword level. Use for granular analysis — which ad groups are performing best, which keywords have high quality scores, which keywords are wasting spend.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'string', description: 'UUID of the local campaign' },
        level: { type: 'string', enum: ['ad_groups', 'keywords'], description: 'ad_groups for ad group metrics, keywords for keyword metrics (requires a specific ad group)' },
        ad_group_id: { type: 'string', description: 'UUID of the ad group (required when level is "keywords")' },
        days: { type: 'number', description: 'Number of days to look back (default 30)' },
      },
      required: ['campaign_id', 'level'],
    },
  },
  // ---- BRAND VISIBILITY ----
  {
    name: 'brand_visibility_report',
    description: 'Generate a comprehensive brand visibility report showing how a brand appears across Google organic search, AI Overviews, LLM answers (ChatGPT), and paid search. Returns scored report with competitor comparison and prioritized improvement steps. Call get_company_context first to get brand details if you don\'t have them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand_name: { type: 'string', description: 'Brand or company name' },
        domain: { type: 'string', description: 'Primary domain (e.g., "aciinfotech.com")' },
        target_keywords: {
          type: 'array', items: { type: 'string' },
          description: 'Keywords to check visibility for (5-15 recommended)',
        },
        competitor_domains: {
          type: 'array', items: { type: 'string' },
          description: 'Optional competitor domains to compare against',
        },
        include_llm_check: { type: 'boolean', description: 'Check LLM (ChatGPT) visibility. Adds ~$0.10 cost. Default: true' },
      },
      required: ['brand_name', 'domain', 'target_keywords'],
    },
  },
  // ---- ANALYTICS INTELLIGENCE ----
  {
    name: 'get_analytics_intelligence',
    description: 'Pull website analytics from Google Analytics 4 and return analysis with flagged issues. Shows traffic, landing page performance, ad click behavior, conversions, or device breakdown. All analysis is data-driven — scores and flags from code, not AI opinion.',
    input_schema: {
      type: 'object' as const,
      properties: {
        report_type: { type: 'string', enum: ['overview', 'landing_pages', 'ad_traffic', 'conversions', 'devices'], description: 'What to analyze' },
        days: { type: 'number', description: 'Lookback period in days (default 30)' },
      },
      required: ['report_type'],
    },
  },
  {
    name: 'get_website_health',
    description: 'Quick website health check using Google Analytics 4. Returns overall health score, traffic trend, top/worst landing pages, conversion rate, and mobile vs desktop performance. No inputs needed — reads GA4 property from settings automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'Lookback period in days (default 30)' },
      },
      required: [],
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

      const results: ComprehensiveKeywordData[] = [];
      const errors: string[] = [];
      for (const kw of keywords.slice(0, 5)) {
        try {
          const data = await comprehensiveKeywordResearch(kw, location);
          results.push(data);
        } catch (e) {
          const errMsg = (e as Error).message;
          errors.push(`"${kw}": ${errMsg}`);
          logger.warn(`Research failed for "${kw}"`, { error: errMsg });
        }
      }

      // Also try Google Ads Keyword Planner for bid estimates
      let googleKeywords: Array<{ text: string; avg_monthly_searches: number; competition: string; low_top_of_page_bid_micros: number; high_top_of_page_bid_micros: number }> = [];
      let googleError = '';
      try {
        const client = await createGoogleAdsClient();
        if (client) {
          googleKeywords = await client.generateKeywordIdeas(keywords.slice(0, 10));
        } else {
          googleError = 'Google Ads not connected';
        }
      } catch (e) {
        googleError = (e as Error).message;
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

      // Build structured markdown summary for the AI
      const lines: string[] = ['## Keyword Research Results\n'];

      for (const r of results) {
        const kd = r.keyword;
        const vol = kd ? kd.search_volume.toLocaleString() : 'N/A';
        const cpc = kd ? `$${kd.cpc.toFixed(2)}` : 'N/A';
        const comp = kd ? kd.competition_level : 'N/A';
        lines.push(`### Seed: "${kd?.keyword || 'unknown'}" (volume: ${vol} | CPC: ${cpc} | competition: ${comp})`);

        // Top related keywords (sorted by volume)
        const sorted = [...r.related].sort((a, b) => b.search_volume - a.search_volume).slice(0, 15);
        if (sorted.length > 0) {
          lines.push('| Keyword | Volume | CPC | Competition |');
          lines.push('|---------|--------|-----|-------------|');
          for (const rk of sorted) {
            lines.push(`| ${rk.keyword} | ${rk.search_volume.toLocaleString()} | $${rk.cpc.toFixed(2)} | ${rk.competition_level} |`);
          }
        }

        // Competitors from SERP
        if (r.competitors.length > 0) {
          lines.push('\n**SERP Competitors:**');
          lines.push('| Position | Domain | Title |');
          lines.push('|----------|--------|-------|');
          for (const c of r.competitors.slice(0, 5)) {
            lines.push(`| ${c.position} | ${c.domain} | ${c.title} |`);
          }
        }

        // People Also Ask
        if (r.questions.length > 0) {
          lines.push('\n**People Also Ask:**');
          for (const q of r.questions.slice(0, 5)) {
            lines.push(`- "${q}"`);
          }
        }
        lines.push('');
      }

      // Google Ads bid estimates
      if (googleKeywords.length > 0) {
        lines.push('### Google Ads Bid Estimates');
        lines.push('| Keyword | Avg Volume | Competition | Low Bid | High Bid |');
        lines.push('|---------|-----------|-------------|---------|----------|');
        const topGoogle = googleKeywords
          .filter((g) => g.avg_monthly_searches > 0)
          .sort((a, b) => b.avg_monthly_searches - a.avg_monthly_searches)
          .slice(0, 15);
        for (const g of topGoogle) {
          const lowBid = g.low_top_of_page_bid_micros ? `$${(g.low_top_of_page_bid_micros / 1_000_000).toFixed(2)}` : 'N/A';
          const highBid = g.high_top_of_page_bid_micros ? `$${(g.high_top_of_page_bid_micros / 1_000_000).toFixed(2)}` : 'N/A';
          lines.push(`| ${g.text} | ${g.avg_monthly_searches.toLocaleString()} | ${g.competition} | ${lowBid} | ${highBid} |`);
        }
        lines.push('');
      }

      if (errors.length > 0) {
        lines.push(`\n**Errors:** ${errors.join('; ')}`);
      }
      if (googleError) {
        lines.push(`**Google Ads Planner:** ${googleError}`);
      }

      const totalKeywords = results.reduce((sum, r) => sum + (r.related?.length || 0), 0);
      if (totalKeywords === 0 && googleKeywords.length === 0) {
        lines.push('\nNo keyword data returned. Check DataForSEO credentials and Google Ads API access level.');
      }

      return { result: lines.join('\n'), data: { dataforseo: results, google_ads: googleKeywords, errors } };
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

      // Extract unique competitors with brand names and ranking keywords
      const competitorMap = new Map<string, { domain: string; brandName: string; ranksFor: string[]; titles: string[] }>();
      for (const result of competitorData) {
        for (const comp of result.competitors) {
          if (!comp.domain) continue;
          const existing = competitorMap.get(comp.domain);
          if (existing) {
            if (!existing.ranksFor.includes(result.keyword)) existing.ranksFor.push(result.keyword);
          } else {
            // Extract brand name from domain: snowflake.com → Snowflake, aws.amazon.com → AWS
            const brand = extractBrandName(comp.domain, comp.title);
            competitorMap.set(comp.domain, {
              domain: comp.domain,
              brandName: brand,
              ranksFor: [result.keyword],
              titles: [comp.title],
            });
          }
        }
      }

      // Store competitor data in DB
      for (const [, comp] of competitorMap) {
        try {
          await supabase.from('competitor_data').upsert({
            domain: comp.domain,
            company_name: comp.brandName,
            notes: `Ranks for: ${comp.ranksFor.join(', ')}`,
          }, { onConflict: 'domain' });
        } catch { /* non-critical */ }
      }

      // Generate conquest keyword suggestions for each competitor
      const competitors = Array.from(competitorMap.values());
      const lines: string[] = ['## Competitor Analysis\n'];

      lines.push('### Competitors Found in SERP');
      lines.push('| Domain | Brand Name | Ranks For |');
      lines.push('|--------|-----------|-----------|');
      for (const comp of competitors) {
        lines.push(`| ${comp.domain} | ${comp.brandName} | ${comp.ranksFor.join(', ')} |`);
      }

      // Generate conquest keywords
      const conquestKeywords: string[] = [];
      lines.push('\n### Recommended Conquest Keywords');
      lines.push('Bid on these to capture competitor traffic (use lower bids, 50-70% of core CPC):');
      lines.push('| Competitor | Conquest Keywords |');
      lines.push('|-----------|-------------------|');
      for (const comp of competitors.slice(0, 5)) {
        const brand = comp.brandName.toLowerCase();
        const conquest = [
          `${brand} alternative`,
          `${brand} vs`,
          `switch from ${brand}`,
          `${brand} pricing`,
          `${brand} competitors`,
        ];
        conquestKeywords.push(...conquest);
        lines.push(`| ${comp.brandName} | ${conquest.join(', ')} |`);
      }

      lines.push(`\n**Total conquest keywords generated:** ${conquestKeywords.length}`);
      lines.push('Use these in a dedicated Conquest ad group with comparison/alternative landing pages.');

      return {
        result: lines.join('\n'),
        data: { competitors, conquestKeywords },
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

      // Auto-merge default negatives from company profile (Layer 3: zero prompt tokens)
      try {
        const { data: profileSetting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'company_profile')
          .single();
        if (profileSetting?.value) {
          const defaults = (profileSetting.value as { default_negative_keywords?: string[] }).default_negative_keywords;
          if (defaults?.length) {
            const existing = new Set(negKeywords.map((k) => k.toLowerCase()));
            for (const d of defaults) {
              if (!existing.has(d.toLowerCase())) negKeywords.push(d);
            }
          }
        }
      } catch { /* no profile — skip */ }

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
      // Normalize headlines — handle strings, objects, mixed, nested arrays
      let rawHeadlines: unknown[] = [];
      if (Array.isArray(input.headlines)) {
        rawHeadlines = input.headlines;
      } else if (typeof input.headlines === 'string') {
        // AI might send comma-separated string
        rawHeadlines = input.headlines.split('|').map((s: string) => s.trim()).filter(Boolean);
      }
      const headlines = rawHeadlines.map((h: unknown) => {
        if (typeof h === 'string') return { text: h.trim() };
        if (typeof h === 'object' && h !== null) {
          const obj = h as Record<string, unknown>;
          return { text: String(obj.text || obj.headline || obj.value || '').trim(), pinned_position: obj.pinned_position as number | undefined };
        }
        return { text: String(h).trim() };
      }).filter((h) => h.text.length > 0);

      let rawDescriptions: unknown[] = [];
      if (Array.isArray(input.descriptions)) {
        rawDescriptions = input.descriptions;
      } else if (typeof input.descriptions === 'string') {
        rawDescriptions = input.descriptions.split('|').map((s: string) => s.trim()).filter(Boolean);
      }
      const descriptions = rawDescriptions.map((d: unknown) => {
        if (typeof d === 'string') return { text: d.trim() };
        if (typeof d === 'object' && d !== null) {
          const obj = d as Record<string, unknown>;
          return { text: String(obj.text || obj.description || obj.value || '').trim() };
        }
        return { text: String(d).trim() };
      }).filter((d) => d.text.length > 0);

      const finalUrls = Array.isArray(input.final_urls)
        ? input.final_urls.map((u: unknown) => String(u)).filter(Boolean)
        : typeof input.final_urls === 'string' ? [input.final_urls] : [];

      logger.info('create_ad input', {
        ad_group_id: input.ad_group_id,
        headlines_count: headlines.length,
        descriptions_count: descriptions.length,
        headlines_sample: headlines.slice(0, 3).map((h) => `"${h.text}" (${h.text.length} chars)`),
      });

      // Validate minimum counts
      if (headlines.length < 3) {
        return { result: `REJECTED: Need at least 3 headlines, got ${headlines.length}. Rewrite and call create_ad again with 3-15 headlines as [{"text": "..."}].` };
      }
      if (descriptions.length < 2) {
        return { result: `REJECTED: Need at least 2 descriptions, got ${descriptions.length}. Rewrite and call create_ad again with 2-4 descriptions as [{"text": "..."}].` };
      }

      // Check character limits — give specific feedback so AI can rewrite
      const tooLongH = headlines.filter((h) => h.text.length > 30);
      const tooLongD = descriptions.filter((d) => d.text.length > 90);
      if (tooLongH.length > 0 || tooLongD.length > 0) {
        const issues: string[] = [];
        for (const h of tooLongH) {
          issues.push(`Headline "${h.text}" is ${h.text.length} chars (max 30) — shorten by ${h.text.length - 30} chars`);
        }
        for (const d of tooLongD) {
          issues.push(`Description "${d.text}" is ${d.text.length} chars (max 90) — shorten by ${d.text.length - 90} chars`);
        }
        return { result: `REJECTED — these are too long. Rewrite them shorter and call create_ad again:\n${issues.join('\n')}` };
      }

      // Remove duplicates (safe auto-fix, doesn't affect quality)
      const seenH = new Set<string>();
      const dedupedHeadlines = headlines.filter((h) => {
        const key = h.text.toLowerCase();
        if (seenH.has(key)) return false;
        seenH.add(key);
        return true;
      });
      const seenD = new Set<string>();
      const dedupedDescriptions = descriptions.filter((d) => {
        const key = d.text.toLowerCase();
        if (seenD.has(key)) return false;
        seenD.add(key);
        return true;
      });

      // Final QA check
      const qaResult = qaSentinel.validateAdCopySync({
        headlines: dedupedHeadlines,
        descriptions: dedupedDescriptions,
        final_urls: finalUrls,
        path1: input.path1 as string,
        path2: input.path2 as string,
      });

      if (!qaResult.passed) {
        const issues = qaResult.errors.map((e) => `${e.field}: ${e.message}`).join('\n');
        return { result: `REJECTED by QA. Fix these and call create_ad again:\n${issues}` };
      }

      const { data: ad, error } = await supabase
        .from('ads')
        .insert({
          ad_group_id: input.ad_group_id as string,
          ad_type: 'RESPONSIVE_SEARCH',
          headlines: dedupedHeadlines,
          descriptions: dedupedDescriptions,
          final_urls: finalUrls,
          path1: (input.path1 as string) || null,
          path2: (input.path2 as string) || null,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        logger.error('create_ad DB error', { error: error.message, code: error.code, details: error.details });
        return { result: `Error creating ad: ${error.message}` };
      }

      const warnings = qaResult.warnings.length > 0
        ? ` Warnings: ${qaResult.warnings.map((w) => w.message).join('; ')}`
        : '';

      return {
        result: `Ad created with ${dedupedHeadlines.length} headlines and ${dedupedDescriptions.length} descriptions.${warnings}`,
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
        ad_groups: (adGroups || []).map((ag: { id: string; name: string; status: string; cpc_bid_micros: number }) => ({
          id: ag.id,
          name: ag.name,
          status: ag.status,
          cpc_bid_micros: ag.cpc_bid_micros,
          ads: ads.filter((a) => a.ad_group_id === ag.id).map((a: Record<string, unknown>) => ({
            id: a.id,
            headlines: a.headlines,
            descriptions: a.descriptions,
            final_urls: a.final_urls,
            status: a.status,
          })),
          keywords: keywords.filter((k) => k.ad_group_id === ag.id).map((k) => ({
            text: k.text,
            match_type: k.match_type,
          })),
        })),
        reasoning: '',
      };

      const qaResult = await qaSentinel.validateCampaignBlueprint(blueprint as any);

      // Build structured summary with IDs so AI can reference them
      const structureLines: string[] = [`Campaign: "${campaign.name}" (${campaignId})\n`];
      for (const ag of blueprint.ad_groups) {
        const agTyped = ag as { id: string; name: string; status: string; ads: Array<{ id: string }>; keywords: Array<{ text: string }> };
        structureLines.push(`Ad Group: "${agTyped.name}" (id: ${agTyped.id}) — ${agTyped.ads.length} ads, ${agTyped.keywords.length} keywords, status: ${agTyped.status}`);
      }

      if (qaResult.passed) {
        const warnText = qaResult.warnings.length > 0
          ? `\nWarnings: ${qaResult.warnings.map((w) => w.message).join('; ')}`
          : '';
        return { result: `Campaign validation PASSED.\n\n${structureLines.join('\n')}${warnText}`, data: qaResult };
      } else {
        const issues = qaResult.errors.map((e) => `${e.field}: ${e.message}`).join('\n');
        return { result: `Campaign validation FAILED:\n${issues}\n\n## Structure with IDs:\n${structureLines.join('\n')}`, data: qaResult };
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

    // ---- UPDATE CAMPAIGN ----
    case 'update_campaign': {
      const updates: Record<string, unknown> = {};
      if (input.name) updates.name = input.name;
      if (input.daily_budget_dollars) updates.budget_amount_micros = Math.round((input.daily_budget_dollars as number) * 1_000_000);
      if (input.bidding_strategy) updates.bidding_strategy = input.bidding_strategy;
      if (input.geo_targets) updates.geo_targets = (input.geo_targets as string[]).map((g) => ({ country: g }));
      if (input.status) updates.status = input.status;

      const { error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', input.campaign_id as string);

      if (error) return { result: `Error updating campaign: ${error.message}` };

      const changed = Object.keys(updates).join(', ');
      return { result: `Campaign updated: ${changed}`, data: { campaign_id: input.campaign_id } };
    }

    // ---- UPDATE AD GROUP ----
    case 'update_ad_group': {
      const updates: Record<string, unknown> = {};
      if (input.name) updates.name = input.name;
      if (input.cpc_bid_micros) updates.cpc_bid_micros = input.cpc_bid_micros;
      if (input.status) updates.status = input.status;

      const { error } = await supabase
        .from('ad_groups')
        .update(updates)
        .eq('id', input.ad_group_id as string);

      if (error) return { result: `Error updating ad group: ${error.message}` };

      return { result: `Ad group updated: ${Object.keys(updates).join(', ')}`, data: { ad_group_id: input.ad_group_id } };
    }

    // ---- UPDATE AD ----
    case 'update_ad': {
      const updates: Record<string, unknown> = {};
      if (input.headlines) {
        const rawHeadlines = Array.isArray(input.headlines) ? input.headlines : [];
        updates.headlines = rawHeadlines.map((h: unknown) => typeof h === 'string' ? { text: h } : h);
      }
      if (input.descriptions) {
        const rawDescs = Array.isArray(input.descriptions) ? input.descriptions : [];
        updates.descriptions = rawDescs.map((d: unknown) => typeof d === 'string' ? { text: d } : d);
      }
      if (input.final_urls) updates.final_urls = Array.isArray(input.final_urls) ? input.final_urls : [input.final_urls];
      if (input.path1 !== undefined) updates.path1 = input.path1 || null;
      if (input.path2 !== undefined) updates.path2 = input.path2 || null;
      if (input.status) updates.status = input.status;

      const { error } = await supabase
        .from('ads')
        .update(updates)
        .eq('id', input.ad_id as string);

      if (error) return { result: `Error updating ad: ${error.message}` };

      return { result: `Ad updated: ${Object.keys(updates).join(', ')}`, data: { ad_id: input.ad_id } };
    }

    // ---- DELETE AD GROUP ----
    case 'delete_ad_group': {
      const agId = input.ad_group_id as string;

      // Soft delete ad group + its ads + its keywords
      await supabase.from('ads').update({ status: 'removed' }).eq('ad_group_id', agId);
      await supabase.from('keywords').update({ status: 'removed' }).eq('ad_group_id', agId);
      const { error } = await supabase.from('ad_groups').update({ status: 'removed' }).eq('id', agId);

      if (error) return { result: `Error deleting ad group: ${error.message}` };

      return { result: `Ad group deleted (and its ads + keywords).`, data: { ad_group_id: agId } };
    }

    // ---- DELETE AD ----
    case 'delete_ad': {
      const { error } = await supabase
        .from('ads')
        .update({ status: 'removed' })
        .eq('id', input.ad_id as string);

      if (error) return { result: `Error deleting ad: ${error.message}` };

      return { result: `Ad deleted.`, data: { ad_id: input.ad_id } };
    }

    // ---- ANALYZE PERFORMANCE ----
    case 'analyze_performance': {
      const days = 30;
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const midDate = new Date(Date.now() - (days / 2) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let query = supabase.from('performance_snapshots').select('*').eq('entity_type', 'campaign').gte('date', dateFrom);
      if (input.campaign_id) query = query.eq('entity_id', input.campaign_id as string);

      const { data: perf } = await query;
      if (!perf || perf.length === 0) return { result: 'No performance data available. Sync Google Ads first.' };

      const recent = perf.filter((p) => p.date >= midDate);
      const older = perf.filter((p) => p.date < midDate);

      const recentTotals = recent.reduce((a, r) => ({ spend: a.spend + r.cost_micros, clicks: a.clicks + r.clicks, conv: a.conv + r.conversions, impr: a.impr + r.impressions }), { spend: 0, clicks: 0, conv: 0, impr: 0 });
      const olderTotals = older.reduce((a, r) => ({ spend: a.spend + r.cost_micros, clicks: a.clicks + r.clicks, conv: a.conv + r.conversions, impr: a.impr + r.impressions }), { spend: 0, clicks: 0, conv: 0, impr: 0 });

      const spendChange = olderTotals.spend > 0 ? ((recentTotals.spend - olderTotals.spend) / olderTotals.spend * 100).toFixed(1) : 'N/A';
      const convChange = olderTotals.conv > 0 ? ((recentTotals.conv - olderTotals.conv) / olderTotals.conv * 100).toFixed(1) : 'N/A';
      const ctrRecent = recentTotals.impr > 0 ? (recentTotals.clicks / recentTotals.impr * 100).toFixed(2) : '0';
      const ctrOlder = olderTotals.impr > 0 ? (olderTotals.clicks / olderTotals.impr * 100).toFixed(2) : '0';

      return {
        result: `Performance Analysis (${days}d):\n\nRecent 15d: $${(recentTotals.spend / 1e6).toFixed(2)} spend, ${recentTotals.clicks} clicks, ${recentTotals.conv} conv, ${ctrRecent}% CTR\nPrevious 15d: $${(olderTotals.spend / 1e6).toFixed(2)} spend, ${olderTotals.clicks} clicks, ${olderTotals.conv} conv, ${ctrOlder}% CTR\n\nSpend change: ${spendChange}%\nConversion change: ${convChange}%\n\n${input.question ? `Investigation focus: ${input.question}` : ''}`,
        data: { recent: recentTotals, older: olderTotals, rows: perf.length },
      };
    }

    // ---- FIND WASTE ----
    case 'find_waste': {
      const days = (input.days as number) || 30;
      const minSpend = ((input.min_spend_dollars as number) || 10) * 1_000_000;
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get campaign performance
      const { data: perf } = await supabase.from('performance_snapshots').select('entity_id, cost_micros, conversions, clicks').eq('entity_type', 'campaign').gte('date', dateFrom);

      // Aggregate by campaign
      const campaignSpend = new Map<string, { spend: number; conv: number; clicks: number }>();
      for (const row of perf || []) {
        const existing = campaignSpend.get(row.entity_id) || { spend: 0, conv: 0, clicks: 0 };
        campaignSpend.set(row.entity_id, {
          spend: existing.spend + row.cost_micros,
          conv: existing.conv + row.conversions,
          clicks: existing.clicks + row.clicks,
        });
      }

      // Find wasted spend (spend > threshold, 0 conversions)
      const wasted: Array<{ id: string; spend: number; clicks: number }> = [];
      for (const [id, stats] of campaignSpend) {
        if (stats.spend >= minSpend && stats.conv === 0) {
          wasted.push({ id, spend: stats.spend, clicks: stats.clicks });
        }
      }

      // Get campaign names
      const wasteDetails = [];
      for (const w of wasted) {
        const { data: camp } = await supabase.from('campaigns').select('name').eq('id', w.id).single();
        wasteDetails.push({ name: camp?.name || w.id, spend: `$${(w.spend / 1e6).toFixed(2)}`, clicks: w.clicks });
      }

      const totalWasted = wasted.reduce((s, w) => s + w.spend, 0);

      if (wasteDetails.length === 0) {
        return { result: `No significant wasted spend found in the last ${days} days (threshold: $${(minSpend / 1e6).toFixed(0)}).` };
      }

      const lines = wasteDetails.map((w) => `- "${w.name}": ${w.spend} spent, ${w.clicks} clicks, 0 conversions`).join('\n');
      return {
        result: `Found $${(totalWasted / 1e6).toFixed(2)} in wasted spend across ${wasteDetails.length} campaign(s) (last ${days}d):\n\n${lines}\n\nRecommendation: Consider pausing these campaigns or reviewing their keywords and landing pages.`,
        data: wasteDetails,
      };
    }

    // ---- SUGGEST OPPORTUNITIES ----
    case 'suggest_opportunities': {
      // Get current campaigns and their performance
      const { data: campaigns } = await supabase.from('campaigns').select('id, name, status, budget_amount_micros').neq('status', 'removed');
      const { data: perf } = await supabase.from('performance_snapshots').select('entity_id, cost_micros, conversions, impressions').eq('entity_type', 'campaign');

      const campaignPerf = new Map<string, { spend: number; conv: number; impr: number }>();
      for (const row of perf || []) {
        const existing = campaignPerf.get(row.entity_id) || { spend: 0, conv: 0, impr: 0 };
        campaignPerf.set(row.entity_id, {
          spend: existing.spend + row.cost_micros,
          conv: existing.conv + row.conversions,
          impr: existing.impr + row.impressions,
        });
      }

      const opportunities: string[] = [];

      // Budget-limited good performers
      for (const camp of campaigns || []) {
        const p = campaignPerf.get(camp.id);
        if (p && p.conv > 0 && camp.status === 'active') {
          const cpa = p.spend / p.conv;
          if (cpa < camp.budget_amount_micros) {
            opportunities.push(`"${camp.name}" has a CPA below daily budget — it could convert more with increased budget.`);
          }
        }
      }

      // Inactive campaigns with potential
      const draftCampaigns = (campaigns || []).filter((c) => c.status === 'draft');
      if (draftCampaigns.length > 0) {
        opportunities.push(`${draftCampaigns.length} draft campaign(s) not yet active: ${draftCampaigns.map((c) => `"${c.name}"`).join(', ')}.`);
      }

      if (opportunities.length === 0) {
        opportunities.push('No obvious opportunities found from current data. Consider running keyword research for new opportunities via the Research tool.');
      }

      return {
        result: `Growth Opportunities:\n\n${opportunities.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
        data: { count: opportunities.length },
      };
    }

    // ---- SEND REPORT ----
    case 'send_report': {
      const { sendEmail, generatePerformanceReportHtml } = await import('../email');
      const recipients = (input.recipients as string[]) || [];
      const reportType = (input.report_type as string) || 'performance';
      const period = (input.period as string) || 'week';

      if (recipients.length === 0) return { result: 'No recipients specified.' };

      // Get data for the report
      const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
      const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: perf } = await supabase.from('performance_snapshots').select('*').eq('entity_type', 'campaign').gte('date', dateFrom);
      const { data: camps } = await supabase.from('campaigns').select('id, name, status, budget_amount_micros').neq('status', 'removed');

      const totals = (perf || []).reduce((a, r) => ({ spend: a.spend + r.cost_micros, clicks: a.clicks + r.clicks, conv: a.conv + r.conversions, impr: a.impr + r.impressions }), { spend: 0, clicks: 0, conv: 0, impr: 0 });

      const html = generatePerformanceReportHtml({
        period: period === 'today' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly',
        metrics: {
          spend: `$${(totals.spend / 1e6).toFixed(2)}`,
          clicks: totals.clicks.toLocaleString(),
          conversions: totals.conv.toFixed(1),
          ctr: totals.impr > 0 ? `${(totals.clicks / totals.impr * 100).toFixed(2)}%` : '0%',
          cpa: totals.conv > 0 ? `$${(totals.spend / totals.conv / 1e6).toFixed(2)}` : '—',
        },
        campaigns: (camps || []).map((c: { id: string; name: string; status: string }) => {
          // Aggregate per-campaign performance
          const campPerf = (perf || []).filter((p) => p.entity_id === c.id);
          const campSpend = campPerf.reduce((s, p) => s + (p.cost_micros || 0), 0);
          const campConv = campPerf.reduce((s, p) => s + (p.conversions || 0), 0);
          return {
            name: c.name,
            spend: `$${(campSpend / 1_000_000).toFixed(2)}`,
            conversions: campConv.toFixed(1),
            health: c.status === 'active' ? 'Active' : c.status,
          };
        }),
        recommendations: [],
        generatedAt: new Date().toLocaleString(),
      });

      const subject = (input.subject as string) || `ACI Ads — ${period === 'today' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly'} Performance Report`;
      const result = await sendEmail({ to: recipients, subject, html });

      if (result.success) {
        // Store generated report
        try {
          await supabase.from('generated_reports').insert({
            report_type: reportType,
            period,
            content: { totals, campaigns: camps?.length || 0 },
            share_token: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
          });
        } catch { /* non-critical */ }
        return { result: `Report sent to ${recipients.join(', ')}. Email ID: ${result.id}` };
      } else {
        return { result: `Failed to send report: ${result.error}` };
      }
    }

    // ---- SCHEDULE REPORT ----
    case 'schedule_report': {
      const { data: schedule, error } = await supabase.from('report_schedules').insert({
        name: input.name as string,
        recipients: input.recipients,
        frequency: input.frequency as string,
        day_of_week: input.day_of_week as number || 1,
        time_of_day: (input.time as string) || '09:00',
        report_type: input.report_type as string,
        is_active: true,
      }).select().single();

      if (error) return { result: `Failed to create schedule: ${error.message}` };

      return {
        result: `Report scheduled: "${input.name}" — ${input.frequency} to ${(input.recipients as string[]).join(', ')}. ID: ${schedule.id}`,
        data: { schedule_id: schedule.id },
      };
    }

    // ---- MANAGE REPORT SCHEDULES ----
    case 'manage_report_schedules': {
      const action = input.action as string;

      if (action === 'list') {
        const { data } = await supabase.from('report_schedules').select('*').order('created_at', { ascending: false });
        if (!data || data.length === 0) return { result: 'No report schedules configured.' };
        const lines = data.map((s: { id: string; name: string; frequency: string; recipients: string[]; is_active: boolean }) =>
          `- "${s.name}" (${s.frequency}) → ${Array.isArray(s.recipients) ? s.recipients.join(', ') : s.recipients} [${s.is_active ? 'Active' : 'Paused'}] ID: ${s.id}`
        ).join('\n');
        return { result: `Report Schedules:\n\n${lines}`, data };
      }

      const scheduleId = input.schedule_id as string;
      if (!scheduleId) return { result: 'schedule_id is required for this action.' };

      if (action === 'pause') {
        await supabase.from('report_schedules').update({ is_active: false }).eq('id', scheduleId);
        return { result: `Schedule ${scheduleId} paused.` };
      }
      if (action === 'resume') {
        await supabase.from('report_schedules').update({ is_active: true }).eq('id', scheduleId);
        return { result: `Schedule ${scheduleId} resumed.` };
      }
      if (action === 'delete') {
        await supabase.from('report_schedules').delete().eq('id', scheduleId);
        return { result: `Schedule ${scheduleId} deleted.` };
      }

      return { result: `Unknown action: ${action}` };
    }

    // ---- SYNC GOOGLE PERFORMANCE ----
    case 'sync_google_performance': {
      const days = Math.min(Math.max((input.days as number) || 7, 1), 90);
      try {
        const result = await syncPerformanceData(days);
        return {
          result: `Synced performance data for last ${days} days: ${result.campaigns_synced} campaigns, ${result.snapshots_upserted} snapshots updated.${result.campaigns_synced === 0 ? ' No campaigns found on Google Ads — have you pushed a campaign yet?' : ''}`,
          data: result,
        };
      } catch (e) {
        return { result: `Sync failed: ${(e as Error).message}. Check Google Ads connection in Settings.` };
      }
    }

    // ---- GET GOOGLE ADS DETAILS ----
    case 'get_google_ads_details': {
      const campaignId = input.campaign_id as string;
      const level = input.level as string;
      const days = Math.min(Math.max((input.days as number) || 30, 1), 90);

      if (!campaignId) return { result: 'campaign_id is required.' };

      const { data: camp } = await supabase
        .from('campaigns')
        .select('id, name, google_campaign_id')
        .eq('id', campaignId)
        .single();

      if (!camp) return { result: `Campaign ${campaignId} not found.` };
      if (!camp.google_campaign_id) return { result: `Campaign "${camp.name}" is not on Google Ads. Push it first.` };

      try {
        const client = await createGoogleAdsClient();
        if (!client) return { result: 'No Google Ads client. Check connection.' };

        const dateTo = new Date().toISOString().split('T')[0];
        const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        if (level === 'ad_groups') {
          const rows = await client.getAdGroupPerformance(camp.google_campaign_id, dateFrom, dateTo);
          if (rows.length === 0) return { result: `No ad group performance data for "${camp.name}" in the last ${days} days.` };

          // Get ad group names from local DB
          const { data: adGroups } = await supabase
            .from('ad_groups')
            .select('google_ad_group_id, name')
            .eq('campaign_id', campaignId);
          const nameMap: Record<string, string> = {};
          for (const ag of adGroups || []) {
            if (ag.google_ad_group_id) nameMap[ag.google_ad_group_id] = ag.name;
          }

          // Aggregate by ad group
          const agMap: Record<string, { name: string; impressions: number; clicks: number; cost: number; conversions: number }> = {};
          for (const r of rows) {
            const id = r.campaign_id || 'unknown'; // actually ad_group_id in the mapped result
            if (!agMap[id]) agMap[id] = { name: nameMap[id] || id, impressions: 0, clicks: 0, cost: 0, conversions: 0 };
            agMap[id].impressions += parseInt(r.metrics.impressions) || 0;
            agMap[id].clicks += parseInt(r.metrics.clicks) || 0;
            agMap[id].cost += parseInt(r.metrics.cost_micros) || 0;
            agMap[id].conversions += parseFloat(r.metrics.conversions) || 0;
          }

          const lines = [`## Ad Group Performance — "${camp.name}" (last ${days} days)\n`];
          lines.push('| Ad Group | Impressions | Clicks | CTR | Spend | Conversions | CPA |');
          lines.push('|----------|------------|--------|-----|-------|-------------|-----|');
          for (const [, ag] of Object.entries(agMap)) {
            const ctr = ag.impressions > 0 ? ((ag.clicks / ag.impressions) * 100).toFixed(1) + '%' : '0%';
            const spend = `$${(ag.cost / 1_000_000).toFixed(2)}`;
            const cpa = ag.conversions > 0 ? `$${(ag.cost / ag.conversions / 1_000_000).toFixed(2)}` : '-';
            lines.push(`| ${ag.name} | ${ag.impressions.toLocaleString()} | ${ag.clicks} | ${ctr} | ${spend} | ${ag.conversions} | ${cpa} |`);
          }
          return { result: lines.join('\n') };

        } else if (level === 'keywords') {
          const adGroupId = input.ad_group_id as string;
          if (!adGroupId) return { result: 'ad_group_id is required for keyword-level details.' };

          const { data: ag } = await supabase
            .from('ad_groups')
            .select('google_ad_group_id, name')
            .eq('id', adGroupId)
            .single();

          if (!ag?.google_ad_group_id) return { result: 'Ad group not found or not synced to Google.' };

          const rows = await client.getKeywordPerformance(ag.google_ad_group_id, dateFrom, dateTo);
          if (rows.length === 0) return { result: `No keyword performance data for "${ag.name}" in the last ${days} days.` };

          const lines = [`## Keyword Performance — "${ag.name}" (last ${days} days)\n`];
          lines.push('| Keyword ID | Impressions | Clicks | CTR | Spend | Conversions |');
          lines.push('|-----------|------------|--------|-----|-------|-------------|');
          for (const r of rows) {
            const imp = parseInt(r.metrics.impressions) || 0;
            const clicks = parseInt(r.metrics.clicks) || 0;
            const ctr = imp > 0 ? ((clicks / imp) * 100).toFixed(1) + '%' : '0%';
            const spend = `$${(parseInt(r.metrics.cost_micros) / 1_000_000).toFixed(2)}`;
            const conv = parseFloat(r.metrics.conversions) || 0;
            lines.push(`| ${r.campaign_id} | ${imp.toLocaleString()} | ${clicks} | ${ctr} | ${spend} | ${conv} |`);
          }
          return { result: lines.join('\n') };
        }

        return { result: 'Invalid level. Use "ad_groups" or "keywords".' };
      } catch (e) {
        return { result: `Failed to get details: ${(e as Error).message}` };
      }
    }

    // ---- GET ANALYTICS INTELLIGENCE ----
    case 'get_analytics_intelligence': {
      const reportType = input.report_type as string;
      const days = Math.min(Math.max((input.days as number) || 30, 1), 90);

      try {
        const lines: string[] = [];

        if (reportType === 'overview') {
          const traffic = await getTrafficOverview(days);
          if (!traffic) return { result: 'No GA4 data available. Set GA4 property ID in Settings and ensure Google Analytics is connected.' };

          lines.push(`## Traffic Overview (last ${days} days)\n`);
          lines.push(`| Metric | Value |`);
          lines.push(`|--------|-------|`);
          lines.push(`| Sessions | ${traffic.sessions.toLocaleString()} |`);
          lines.push(`| Users | ${traffic.users.toLocaleString()} |`);
          lines.push(`| New Users | ${traffic.new_users.toLocaleString()} |`);
          lines.push(`| Pageviews | ${traffic.pageviews.toLocaleString()} |`);
          lines.push(`| Bounce Rate | ${(traffic.bounce_rate * 100).toFixed(1)}% |`);
          lines.push(`| Avg Session Duration | ${traffic.avg_session_duration.toFixed(0)}s |`);
          lines.push(`| Engagement Rate | ${(traffic.engagement_rate * 100).toFixed(1)}% |`);

          // Flag issues
          if (traffic.bounce_rate >= THRESHOLDS.bounce_rate.warning) {
            lines.push(`\n**Flag:** Bounce rate ${(traffic.bounce_rate * 100).toFixed(1)}% exceeds ${(THRESHOLDS.bounce_rate.warning * 100)}% threshold.`);
          }

        } else if (reportType === 'landing_pages') {
          const pages = await getLandingPagePerformance(days);
          if (pages.length === 0) return { result: 'No landing page data available.' };

          // Classify pages by purpose — don't grade non-conversion pages on conversion rate
          // /lp/ pages are dedicated landing pages (primary conversion targets)
          // Service/product pages are secondary conversion targets
          const NON_CONVERSION_PATTERNS = [
            '/careers', '/jobs', '/blog', '/about', '/team', '/privacy',
            '/terms', '/cookie', '/sitemap', '/404', '/login', '/signup',
            '/press', '/news', '/events', '/podcast', '/webinar',
          ];
          const CONVERSION_PATTERNS = ['/lp/', '/services', '/platforms', '/contact', '/solutions', '/pricing', '/demo', '/get-started', '/free-trial', '/industries'];
          const isConversionPage = (page: string) => {
            const p = page.toLowerCase();
            // Explicitly a conversion page
            if (CONVERSION_PATTERNS.some((pattern) => p.includes(pattern))) return true;
            // Explicitly NOT a conversion page
            if (NON_CONVERSION_PATTERNS.some((pattern) => p.startsWith(pattern))) return false;
            // Homepage and unknown pages — include but don't flag harshly
            return true;
          };

          const conversionPages = pages.filter((p) => isConversionPage(p.page));
          const contentPages = pages.filter((p) => !isConversionPage(p.page));

          // Conversion pages — graded on conversion rate
          if (conversionPages.length > 0) {
            lines.push(`## Service & Landing Pages (last ${days} days)\n`);
            lines.push('These are your business pages — services, landing pages, and product pages. Graded on conversion rate.\n');
            lines.push('| Page | Sessions | Bounce | Duration | Conv | Conv Rate | Grade |');
            lines.push('|------|----------|--------|----------|------|-----------|-------|');
            for (const p of conversionPages.slice(0, 15)) {
              const grade = p.conversion_rate >= 0.05 ? 'A' : p.conversion_rate >= 0.03 ? 'B' : p.conversion_rate >= 0.01 ? 'C' : p.sessions > 50 ? 'F' : '-';
              lines.push(`| ${p.page} | ${p.sessions} | ${(p.bounce_rate * 100).toFixed(0)}% | ${p.avg_duration.toFixed(0)}s | ${p.conversions} | ${(p.conversion_rate * 100).toFixed(1)}% | ${grade} |`);
            }

            // Flag underperforming conversion pages only
            const bad = conversionPages.filter((p) => p.sessions >= 50 && p.conversion_rate < THRESHOLDS.conversion_rate.poor);
            if (bad.length > 0) {
              lines.push(`\n### Underperforming Pages`);
              lines.push(`These ${bad.length} business pages get 50+ sessions but convert below ${(THRESHOLDS.conversion_rate.poor * 100)}%. They already have traffic — fix these first.\n`);
              lines.push('| Page | Sessions | Conv Rate | Bounce | Issue |');
              lines.push('|------|----------|-----------|--------|-------|');
              for (const p of bad.slice(0, 5)) {
                const issue = p.bounce_rate >= 0.6 ? 'High bounce — visitors leave immediately' : p.avg_duration < 15 ? 'Very short visits — content not engaging' : 'Traffic but no conversions — review CTA and form';
                lines.push(`| ${p.page} | ${p.sessions} | ${(p.conversion_rate * 100).toFixed(1)}% | ${(p.bounce_rate * 100).toFixed(0)}% | ${issue} |`);
              }
            }
          }

          // Content/other pages — graded on engagement, not conversion
          if (contentPages.length > 0) {
            lines.push(`\n## Content & Other Pages\n`);
            lines.push('These pages serve a different purpose (careers, blog, about). Graded on engagement, not conversion.\n');
            lines.push('| Page | Sessions | Bounce | Duration | Purpose |');
            lines.push('|------|----------|--------|----------|---------|');
            for (const p of contentPages.slice(0, 10)) {
              const purpose = p.page.includes('/careers') || p.page.includes('/jobs') ? 'Careers'
                : p.page.includes('/blog') ? 'Blog' : p.page.includes('/about') ? 'About' : 'Content';
              lines.push(`| ${p.page} | ${p.sessions} | ${(p.bounce_rate * 100).toFixed(0)}% | ${p.avg_duration.toFixed(0)}s | ${purpose} |`);
            }
          }

        } else if (reportType === 'ad_traffic') {
          const adPages = await getAdTrafficBehavior(days);
          if (adPages.length === 0) return { result: 'No Google Ads traffic data in GA4. Ensure UTM tracking is set up and ads are running.' };

          lines.push(`## Ad Click Behavior (last ${days} days)\n`);
          lines.push('Showing what happens AFTER someone clicks your Google Ad:\n');
          lines.push('| Landing Page | Sessions | Bounce | Duration | Conversions | Conv Rate |');
          lines.push('|-------------|----------|--------|----------|-------------|-----------|');
          for (const p of adPages.slice(0, 15)) {
            lines.push(`| ${p.page} | ${p.sessions} | ${(p.bounce_rate * 100).toFixed(0)}% | ${p.avg_duration.toFixed(0)}s | ${p.conversions} | ${(p.conversion_rate * 100).toFixed(1)}% |`);
          }

        } else if (reportType === 'conversions') {
          const events = await getConversionEvents(days);
          const channels = await getAcquisitionChannels(days);

          lines.push(`## Conversion Analysis (last ${days} days)\n`);

          if (events.length > 0) {
            lines.push('**Key Events:**');
            lines.push('| Event | Count |');
            lines.push('|-------|-------|');
            for (const e of events) lines.push(`| ${e.event_name} | ${e.count} |`);
          }

          if (channels.length > 0) {
            lines.push('\n**Conversions by Channel:**');
            lines.push('| Source / Medium | Sessions | Conversions | Bounce |');
            lines.push('|----------------|----------|-------------|--------|');
            for (const c of channels.slice(0, 10)) {
              lines.push(`| ${c.source} / ${c.medium} | ${c.sessions} | ${c.conversions} | ${(c.bounce_rate * 100).toFixed(0)}% |`);
            }
          }

        } else if (reportType === 'devices') {
          const devices = await getDeviceBreakdown(days);
          if (devices.length === 0) return { result: 'No device data available.' };

          lines.push(`## Device Performance (last ${days} days)\n`);
          lines.push('| Device | Sessions | Users | Conversions | Conv Rate | Bounce |');
          lines.push('|--------|----------|-------|-------------|-----------|--------|');
          for (const d of devices) {
            lines.push(`| ${d.device} | ${d.sessions} | ${d.users} | ${d.conversions} | ${(d.conversion_rate * 100).toFixed(1)}% | ${(d.bounce_rate * 100).toFixed(0)}% |`);
          }

          const mobile = devices.find((d) => d.device === 'mobile');
          const desktop = devices.find((d) => d.device === 'desktop');
          if (mobile && desktop && desktop.conversion_rate > 0) {
            const gap = desktop.conversion_rate / (mobile.conversion_rate || 0.001);
            if (gap >= THRESHOLDS.mobile_gap.warning) {
              lines.push(`\n**Flag:** Mobile converts ${gap.toFixed(1)}x worse than desktop. Mobile: ${(mobile.conversion_rate * 100).toFixed(1)}%, Desktop: ${(desktop.conversion_rate * 100).toFixed(1)}%.`);
            }
          }

        } else {
          return { result: 'Invalid report_type. Use: overview, landing_pages, ad_traffic, conversions, devices.' };
        }

        return { result: lines.join('\n') };
      } catch (e) {
        return { result: `Analytics failed: ${(e as Error).message}. Check GA4 connection.` };
      }
    }

    // ---- GET WEBSITE HEALTH ----
    case 'get_website_health': {
      const days = Math.min(Math.max((input.days as number) || 30, 1), 90);

      try {
        const [traffic, pages, devices] = await Promise.all([
          getTrafficOverview(days),
          getLandingPagePerformance(days, 10),
          getDeviceBreakdown(days),
        ]);

        if (!traffic) return { result: 'No GA4 data. Set GA4 property ID in Settings.' };

        // Score website health (deterministic)
        const health = scoreWebsiteHealth(traffic, pages, devices);
        const recommendations = selectRecommendations(health.flags);

        const lines: string[] = [
          `## Website Health Score: ${health.score}/100\n`,
          `**Traffic:** ${traffic.sessions.toLocaleString()} sessions, ${traffic.users.toLocaleString()} users (last ${days} days)`,
          `**Bounce Rate:** ${(traffic.bounce_rate * 100).toFixed(1)}%`,
          `**Engagement:** ${(traffic.engagement_rate * 100).toFixed(1)}%`,
        ];

        // Top/worst pages
        if (pages.length > 0) {
          const best = pages.filter((p) => p.sessions >= 30).sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
          const worst = pages.filter((p) => p.sessions >= 30).sort((a, b) => a.conversion_rate - b.conversion_rate)[0];
          if (best) lines.push(`\n**Best page:** ${best.page} — ${(best.conversion_rate * 100).toFixed(1)}% conversion (${best.sessions} sessions)`);
          if (worst && worst !== best) lines.push(`**Worst page:** ${worst.page} — ${(worst.conversion_rate * 100).toFixed(1)}% conversion (${worst.sessions} sessions)`);
        }

        // Device split
        const mobile = devices.find((d) => d.device === 'mobile');
        const desktop = devices.find((d) => d.device === 'desktop');
        if (mobile && desktop) {
          lines.push(`\n**Desktop:** ${(desktop.conversion_rate * 100).toFixed(1)}% conversion | **Mobile:** ${(mobile.conversion_rate * 100).toFixed(1)}% conversion`);
        }

        // Issues found
        if (recommendations.length > 0) {
          lines.push(`\n### Issues Found (${recommendations.length}):`);
          for (const r of recommendations.slice(0, 5)) {
            lines.push(`- **${r.recommendation.title}:** ${r.recommendation.action}`);
          }
        } else {
          lines.push('\nNo major issues detected.');
        }

        return { result: lines.join('\n'), data: { score: health.score, flags: health.flags.length } };
      } catch (e) {
        return { result: `Health check failed: ${(e as Error).message}` };
      }
    }

    // ---- BRAND VISIBILITY REPORT ----
    case 'brand_visibility_report': {
      const brandName = input.brand_name as string;
      const domain = input.domain as string;
      const keywords = (input.target_keywords as string[]) || [];
      const competitorDomains = (input.competitor_domains as string[]) || [];
      const includeLlm = input.include_llm_check !== false;

      if (!brandName || !domain || keywords.length === 0) {
        return { result: 'brand_name, domain, and target_keywords are required.' };
      }

      logger.info('Running brand visibility report', { brand: brandName, keywords: keywords.length });

      // Cap keywords to avoid timeouts (10 max for SERP, 8 for LLM)
      const serpKeywords = keywords.slice(0, 10);
      const llmKeywords = keywords.slice(0, 8);

      if (keywords.length > 10) {
        logger.info(`Capped from ${keywords.length} to 10 keywords to avoid timeout`);
      }

      // Step 1: Run SERP Advanced — parallel for speed
      const serpPromises = serpKeywords.map((kw) =>
        getSerpAdvanced(kw).catch((e) => {
          logger.warn(`SERP failed for "${kw}"`, { error: (e as Error).message });
          return null;
        }),
      );
      const serpResults = (await Promise.all(serpPromises)).filter(Boolean) as Awaited<ReturnType<typeof getSerpAdvanced>>[];

      // Step 2: LLM visibility check (optional) — already runs in parallel internally
      let llmResults: Awaited<ReturnType<typeof checkLlmVisibility>> = [];
      if (includeLlm) {
        try {
          llmResults = await checkLlmVisibility(brandName, domain, llmKeywords);
        } catch (e) {
          logger.warn('LLM visibility check failed', { error: (e as Error).message });
        }
      }

      // Step 3: Score everything (deterministic code — no LLM)
      const organicResult = scoreOrganic(serpResults, domain);
      const aiResult = scoreAiOverview(serpResults, domain);
      const paidResult = scorePaid(serpResults, domain);
      const llmResult = scoreLlm(llmResults);

      const overallScore = calculateOverallScore({
        organic: organicResult.score,
        ai_overview: aiResult.score,
        paid: paidResult.score,
        llm: llmResult.score,
        website: 50, // Website score needs GA4 — neutral placeholder
      });

      // Step 4: Select recommendations from catalog (deterministic)
      const allFlags = [...organicResult.flags, ...aiResult.flags, ...paidResult.flags, ...llmResult.flags];
      const recommendations = selectRecommendations(allFlags);

      // Step 5: Build competitor comparison
      const domainBase = domain.replace(/^www\./, '').toLowerCase();
      const competitorMap = new Map<string, { organic: number; ai_citations: number; paid: number }>();
      for (const serp of serpResults) {
        for (const org of serp.organic.slice(0, 5)) {
          const d = org.domain.toLowerCase();
          if (d.includes(domainBase)) continue;
          if (competitorDomains.length > 0 && !competitorDomains.some((cd) => d.includes(cd.toLowerCase()))) continue;
          if (!competitorMap.has(d)) competitorMap.set(d, { organic: 0, ai_citations: 0, paid: 0 });
          competitorMap.get(d)!.organic++;
        }
        for (const cite of serp.ai_overview_citations) {
          const d = cite.domain.toLowerCase();
          if (d.includes(domainBase)) continue;
          if (!competitorMap.has(d)) competitorMap.set(d, { organic: 0, ai_citations: 0, paid: 0 });
          competitorMap.get(d)!.ai_citations++;
        }
        for (const p of serp.paid) {
          const d = p.domain.toLowerCase();
          if (d.includes(domainBase)) continue;
          if (!competitorMap.has(d)) competitorMap.set(d, { organic: 0, ai_citations: 0, paid: 0 });
          competitorMap.get(d)!.paid++;
        }
      }

      // Step 6: Store in database
      const costCents = Math.round(serpResults.length * 0.4 + llmResults.length * 1);
      try {
        await supabase.from('brand_visibility_reports').insert({
          brand_name: brandName,
          domain,
          target_keywords: keywords,
          competitor_domains: competitorDomains,
          overall_score: overallScore,
          organic_score: organicResult.score,
          ai_overview_score: aiResult.score,
          llm_score: llmResult.score,
          paid_score: paidResult.score,
          organic_results: serpResults.map((s) => ({
            keyword: s.keyword,
            brand_position: s.organic.find((o) => o.domain.toLowerCase().includes(domainBase))?.position || null,
            top_competitor: s.organic[0]?.domain || null,
          })),
          ai_overview_results: serpResults.map((s) => ({
            keyword: s.keyword,
            has_overview: s.ai_overview_exists,
            brand_cited: s.ai_overview_citations.some((c) => c.domain.toLowerCase().includes(domainBase)),
            citations: s.ai_overview_citations.map((c) => c.domain).slice(0, 5),
          })),
          llm_results: llmResults,
          paid_results: serpResults.map((s) => ({
            keyword: s.keyword,
            brand_ad: s.paid.find((p) => p.domain.toLowerCase().includes(domainBase))?.position || null,
            competitor_ads: s.paid.filter((p) => !p.domain.toLowerCase().includes(domainBase)).map((p) => p.domain).slice(0, 3),
          })),
          competitor_comparison: Object.fromEntries(competitorMap),
          recommendations: recommendations.map((r) => ({ id: r.recommendation.id, title: r.recommendation.title, action: r.recommendation.action, data: r.data, priority: r.priority })),
          api_cost_cents: costCents,
        });
      } catch (e) {
        logger.warn('Failed to store visibility report', { error: (e as Error).message });
      }

      // Step 7: Build formatted output for the AI
      const lines: string[] = [
        `## Brand Visibility Report — ${brandName}`,
        `**Overall Score: ${overallScore}/100**\n`,
      ];

      // Organic
      lines.push(`### Google Organic (Score: ${organicResult.score}/100)`);
      lines.push('| Keyword | Your Position | Top Competitor |');
      lines.push('|---------|--------------|----------------|');
      for (const serp of serpResults) {
        const brandPos = serp.organic.find((o) => o.domain.toLowerCase().includes(domainBase))?.position;
        const topComp = serp.organic.find((o) => !o.domain.toLowerCase().includes(domainBase));
        lines.push(`| ${serp.keyword} | ${brandPos ? `#${brandPos}` : 'Not found'} | ${topComp ? `${topComp.domain} (#${topComp.position})` : '—'} |`);
      }

      // AI Overviews
      lines.push(`\n### AI Overview Citations (Score: ${aiResult.score}/100)`);
      lines.push('| Keyword | AI Overview? | You Cited? | Who\'s Cited |');
      lines.push('|---------|-------------|-----------|------------|');
      for (const serp of serpResults) {
        if (!serp.ai_overview_exists) {
          lines.push(`| ${serp.keyword} | No | — | — |`);
        } else {
          const cited = serp.ai_overview_citations.some((c) => c.domain.toLowerCase().includes(domainBase));
          const others = serp.ai_overview_citations.filter((c) => !c.domain.toLowerCase().includes(domainBase)).map((c) => c.domain).slice(0, 3).join(', ');
          lines.push(`| ${serp.keyword} | Yes | ${cited ? 'Yes' : 'No'} | ${others || '—'} |`);
        }
      }

      // LLM Visibility
      if (llmResults.length > 0) {
        lines.push(`\n### LLM Visibility (Score: ${llmResult.score}/100)`);
        lines.push('| Question | Mentioned? | Position | Competitors |');
        lines.push('|----------|-----------|----------|-------------|');
        for (const r of llmResults) {
          lines.push(`| ${r.question} | ${r.mentioned ? 'Yes' : 'No'} | ${r.position ? `#${r.position}` : '—'} | ${r.competitors_mentioned.slice(0, 3).join(', ') || '—'} |`);
        }
      }

      // Paid Search
      lines.push(`\n### Paid Search (Score: ${paidResult.score}/100)`);
      lines.push('| Keyword | Your Ad | Competitor Ads |');
      lines.push('|---------|---------|----------------|');
      for (const serp of serpResults) {
        const brandAd = serp.paid.find((p) => p.domain.toLowerCase().includes(domainBase));
        const compAds = serp.paid.filter((p) => !p.domain.toLowerCase().includes(domainBase)).map((p) => p.domain).slice(0, 3).join(', ');
        lines.push(`| ${serp.keyword} | ${brandAd ? `#${brandAd.position}` : 'Not bidding'} | ${compAds || '—'} |`);
      }

      // Recommendations
      if (recommendations.length > 0) {
        lines.push('\n### Action Plan');
        for (let i = 0; i < Math.min(recommendations.length, 7); i++) {
          const r = recommendations[i];
          lines.push(`${i + 1}. **${r.recommendation.title}** — ${r.recommendation.action}`);
        }
      }

      lines.push(`\n*Cost: $${(costCents / 100).toFixed(2)} | ${serpResults.length} keywords checked*`);

      return { result: lines.join('\n'), data: { overall_score: overallScore, organic: organicResult.score, ai_overview: aiResult.score, llm: llmResult.score, paid: paidResult.score } };
    }

    // ---- IMPORT GOOGLE CAMPAIGNS ----
    case 'import_google_campaigns': {
      try {
        const imported = await importCampaignsFromGoogle();
        if (imported === 0) {
          return { result: 'No new campaigns to import. All Google Ads campaigns are already in the local database.' };
        }
        return { result: `Imported ${imported} campaigns from Google Ads. Use check_google_ads_status to see them.` };
      } catch (e) {
        return { result: `Import failed: ${(e as Error).message}. Check Google Ads connection.` };
      }
    }

    // ---- CHECK GOOGLE ADS STATUS ----
    case 'check_google_ads_status': {
      // Check connection
      const { data: account } = await supabase
        .from('google_ads_accounts')
        .select('customer_id, is_active, last_synced_at, account_name')
        .eq('is_active', true)
        .single();

      const lines: string[] = ['## Google Ads Status\n'];

      if (!account || account.customer_id === 'pending') {
        lines.push('**Connection:** Not connected. Go to Settings to connect Google Ads.');
        return { result: lines.join('\n') };
      }

      lines.push(`**Connection:** Connected (Customer ID: ${account.customer_id})`);
      lines.push(`**Last Synced:** ${account.last_synced_at ? new Date(account.last_synced_at).toLocaleString() : 'Never'}\n`);

      // Get campaigns
      let query = supabase
        .from('campaigns')
        .select('id, name, status, google_campaign_id, last_synced_at, budget_amount_micros')
        .neq('status', 'removed')
        .order('created_at', { ascending: false });

      if (input.campaign_id) {
        query = query.eq('id', input.campaign_id as string);
      }

      const { data: campaigns } = await query;

      if (!campaigns?.length) {
        lines.push('No campaigns found.');
        return { result: lines.join('\n') };
      }

      // Get ad group counts
      const campaignIds = campaigns.map((c: { id: string }) => c.id);
      const { data: adGroupCounts } = await supabase
        .from('ad_groups')
        .select('campaign_id')
        .in('campaign_id', campaignIds)
        .neq('status', 'removed');

      const agCountMap: Record<string, number> = {};
      for (const ag of adGroupCounts || []) {
        agCountMap[ag.campaign_id] = (agCountMap[ag.campaign_id] || 0) + 1;
      }

      lines.push('| Campaign | Local Status | Google ID | Ad Groups | Budget/day | Synced |');
      lines.push('|----------|-------------|-----------|-----------|------------|--------|');

      for (const c of campaigns) {
        const googleId = c.google_campaign_id || 'Not pushed';
        const synced = c.last_synced_at ? new Date(c.last_synced_at).toLocaleDateString() : 'Never';
        const budget = `$${(c.budget_amount_micros / 1_000_000).toFixed(0)}`;
        const agCount = agCountMap[c.id] || 0;
        lines.push(`| ${c.name} | ${c.status} | ${googleId} | ${agCount} | ${budget} | ${synced} |`);
      }

      return { result: lines.join('\n') };
    }

    // ---- TOGGLE CAMPAIGN STATUS ----
    case 'toggle_campaign_status': {
      const campaignId = input.campaign_id as string;
      const newStatus = input.status as string;

      if (!campaignId) return { result: 'campaign_id is required.' };

      const { data: camp } = await supabase
        .from('campaigns')
        .select('id, name, google_campaign_id, status')
        .eq('id', campaignId)
        .single();

      if (!camp) return { result: `Campaign ${campaignId} not found.` };
      if (!camp.google_campaign_id) {
        return { result: `Campaign "${camp.name}" is not on Google Ads yet. Push it first with push_campaign_to_google.` };
      }

      try {
        const client = await createGoogleAdsClient();
        if (!client) return { result: 'No Google Ads client available. Check connection in Settings.' };

        const { data: account } = await supabase
          .from('google_ads_accounts')
          .select('customer_id')
          .eq('is_active', true)
          .single();

        if (!account?.customer_id) return { result: 'No active Google Ads account.' };

        const resourceName = `customers/${account.customer_id}/campaigns/${camp.google_campaign_id}`;
        const googleStatus = newStatus === 'enable' ? 'ENABLED' : 'PAUSED';

        await client.updateCampaignStatus(resourceName, googleStatus as 'ENABLED' | 'PAUSED');

        // Update local status
        const localStatus = newStatus === 'enable' ? 'active' : 'paused';
        await supabase.from('campaigns').update({ status: localStatus }).eq('id', campaignId);

        return {
          result: `Campaign "${camp.name}" is now ${googleStatus} on Google Ads.`,
        };
      } catch (e) {
        return { result: `Failed to ${newStatus} campaign: ${(e as Error).message}` };
      }
    }

    // ---- PUSH CAMPAIGN TO GOOGLE ----
    case 'push_campaign_to_google': {
      const campaignId = input.campaign_id as string;
      const action = input.action as string;

      if (!campaignId) return { result: 'campaign_id is required.' };

      // Verify campaign exists
      const { data: camp } = await supabase
        .from('campaigns')
        .select('id, name, google_campaign_id, status')
        .eq('id', campaignId)
        .single();

      if (!camp) return { result: `Campaign ${campaignId} not found.` };

      try {
        if (action === 'push_ads_only') {
          if (!camp.google_campaign_id) {
            return { result: `Campaign "${camp.name}" hasn't been pushed to Google yet. Use action "full_push" first.` };
          }
          const result = await rePushAds(campaignId);
          return {
            result: result.success
              ? `Re-pushed ${result.ads_pushed} ads for "${camp.name}" to Google Ads.`
              : `Pushed ${result.ads_pushed} ads with ${result.errors.length} errors: ${result.errors.slice(0, 3).join('; ')}`,
            data: result,
          };
        } else {
          // Full push
          if (camp.google_campaign_id) {
            return { result: `Campaign "${camp.name}" is already on Google Ads (ID: ${camp.google_campaign_id}). Use "push_ads_only" to update ads, or create a new campaign.` };
          }

          const { pushChangeToGoogle } = await import('../google-ads/sync');
          const result = await pushChangeToGoogle('create_campaign', { campaign_id: campaignId });

          if (result.success) {
            // Refresh campaign data
            const { data: updated } = await supabase.from('campaigns').select('google_campaign_id').eq('id', campaignId).single();
            return {
              result: `Campaign "${camp.name}" pushed to Google Ads! Google Campaign ID: ${updated?.google_campaign_id || 'assigned'}. Status: PAUSED (use toggle_campaign_status to enable).`,
              data: result,
            };
          } else {
            return { result: `Push failed: ${result.error}` };
          }
        }
      } catch (e) {
        return { result: `Push failed: ${(e as Error).message}. Check Google Ads connection.` };
      }
    }

    // ---- COMPANY CONTEXT ----
    case 'get_company_context': {
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'company_profile')
        .single();

      if (!setting?.value) {
        return {
          result: 'No company profile configured. The user should set up their company profile in Settings. Proceed with what the user has told you about their business.',
        };
      }

      const profile = setting.value as Record<string, unknown>;
      const lines: string[] = ['## Company Profile\n'];

      if (profile.company_name) lines.push(`**Company:** ${profile.company_name}`);
      if (profile.domain) lines.push(`**Domain:** ${profile.domain}`);
      if (profile.tagline) lines.push(`**Tagline:** ${profile.tagline}`);

      // Services (used as seed keywords for research)
      const services = profile.services as Array<{ name: string; description?: string }> | undefined;
      if (services?.length) {
        lines.push(`\n**Services/Products:** ${services.map((s) => s.name).join(', ')}`);
      }

      // USPs
      const usps = profile.differentiators as string[] | undefined;
      if (usps?.length) {
        lines.push('\n**Differentiators (use in ad copy):**');
        for (const u of usps) lines.push(`- ${u}`);
      }

      // Industries
      const industries = profile.target_industries as string[] | undefined;
      if (industries?.length) {
        lines.push(`\n**Target Industries:** ${industries.join(', ')}`);
      }

      // Competitors
      const competitors = profile.known_competitors as Array<{ name: string; domain?: string }> | undefined;
      if (competitors?.length) {
        lines.push('\n**Known Competitors (target in conquest groups):**');
        for (const c of competitors) {
          lines.push(`- ${c.name}${c.domain ? ` (${c.domain})` : ''}`);
        }
      } else {
        lines.push('\n**Competitors:** Not specified — discover them from SERP via analyze_competitors.');
      }

      // Brand terms
      const brandTerms = profile.brand_terms as string[] | undefined;
      if (brandTerms?.length) {
        lines.push(`\n**Brand Terms (defend with brand campaigns):** ${brandTerms.join(', ')}`);
      }

      // Default negatives
      const negatives = profile.default_negative_keywords as string[] | undefined;
      if (negatives?.length) {
        lines.push(`\n**Default Negative Keywords (auto-applied to all ad groups):** ${negatives.join(', ')}`);
      } else {
        lines.push('\n**Default Negatives:** Not specified — use standard negatives: jobs, careers, free, tutorial, training, certification, salary, intern.');
      }

      // Tone
      if (profile.tone) lines.push(`\n**Brand Voice:** ${profile.tone}`);

      return { result: lines.join('\n'), data: profile };
    }

    default:
      return { result: `Unknown tool: ${name}` };
  }
}

// ============================================================
// Stage-specific tool filtering
// ============================================================

export type PipelineStage = 'gather' | 'research' | 'strategy' | 'build' | 'present' | 'edit' | 'approve' | 'standalone';

// Tool groups for intent-based selection
export const TOOL_GROUPS: Record<string, ToolName[]> = {
  campaign_create: ['create_campaign', 'create_ad_group', 'create_ad', 'build_tracking_urls', 'search_images', 'get_company_context', 'push_campaign_to_google'],
  campaign_read: ['get_campaign_performance', 'validate_campaign', 'check_google_ads_status', 'import_google_campaigns'],
  campaign_edit: ['update_campaign', 'update_ad_group', 'update_ad', 'delete_ad_group', 'delete_ad', 'validate_campaign', 'push_campaign_to_google', 'toggle_campaign_status'],
  research: ['research_keywords', 'analyze_competitors', 'get_company_context', 'brand_visibility_report'],
  analytics: ['analyze_performance', 'find_waste', 'suggest_opportunities', 'sync_google_performance', 'get_google_ads_details', 'get_analytics_intelligence', 'get_website_health'],
  reports: ['send_report', 'schedule_report', 'manage_report_schedules'],
  interaction: ['ask_user_questions'],
};

// Default fallback groups for vague/unclear prompts
export const FALLBACK_GROUPS = ['analytics', 'campaign_read', 'campaign_edit', 'interaction'];

/**
 * Get tools for a specific pipeline stage (used by pipeline stages)
 */
export function getToolsForStage(stage: PipelineStage): Anthropic.Tool[] {
  const toolsByStage: Record<PipelineStage, ToolName[]> = {
    gather: ['ask_user_questions', 'get_company_context'],
    research: ['research_keywords', 'analyze_competitors', 'get_company_context'],
    strategy: ['get_company_context'],
    build: ['create_campaign', 'create_ad_group', 'create_ad', 'build_tracking_urls', 'search_images', 'delete_ad_group', 'delete_ad', 'get_company_context'],
    present: ['validate_campaign'],
    edit: ['update_campaign', 'update_ad_group', 'update_ad', 'delete_ad_group', 'delete_ad', 'create_ad_group', 'create_ad', 'build_tracking_urls', 'get_company_context'],
    approve: ['validate_campaign', 'submit_for_approval'],
    standalone: [], // Will be filled by classifier — empty here
  };

  const allowedNames = toolsByStage[stage] || [];
  return TOOL_DEFINITIONS.filter((t) => allowedNames.includes(t.name as ToolName));
}

/**
 * Get tools by group names (used by standalone stage with classifier)
 */
export function getToolsByGroups(groups: string[]): Anthropic.Tool[] {
  const toolNames = new Set<string>();
  for (const group of groups) {
    const groupTools = TOOL_GROUPS[group];
    if (groupTools) {
      groupTools.forEach((t) => toolNames.add(t));
    }
  }
  // Always include interaction tools
  TOOL_GROUPS.interaction.forEach((t) => toolNames.add(t));

  return TOOL_DEFINITIONS.filter((t) => toolNames.has(t.name));
}
