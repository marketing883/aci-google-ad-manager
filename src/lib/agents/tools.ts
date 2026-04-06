import type Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../supabase-server';
import { createLogger } from '../utils/logger';
import { comprehensiveKeywordResearch, getCompetitors, getRelatedKeywords, type ComprehensiveKeywordData } from '../dataforseo';
import { searchImages } from '../unsplash';
import { createGoogleAdsClient } from '../google-ads/client';
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
  | 'get_company_context';

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
  campaign_create: ['create_campaign', 'create_ad_group', 'create_ad', 'build_tracking_urls', 'search_images', 'get_company_context'],
  campaign_read: ['get_campaign_performance', 'validate_campaign'],
  campaign_edit: ['update_campaign', 'update_ad_group', 'update_ad', 'delete_ad_group', 'delete_ad'],
  research: ['research_keywords', 'analyze_competitors', 'get_company_context'],
  analytics: ['analyze_performance', 'find_waste', 'suggest_opportunities'],
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
