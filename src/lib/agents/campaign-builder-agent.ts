import { BaseAdsAgent } from './base-agent';
import { campaignBlueprintSchema, type CampaignBlueprint, type ResearchOutput } from '@/schemas/agent-output';

// ============================================================
// CampaignBuilderAgent — Builds complete campaign structures
// Two-pass: Sonnet for strategy, then structured output
// Supports all campaign types
// ============================================================

const SYSTEM_PROMPT = `You are a senior Google Ads campaign architect. You build complete, well-structured campaigns based on research intelligence.

## Google Ads Best Practices

### Campaign Structure
- Group keywords by intent and theme into focused ad groups (5-20 keywords per group)
- Each ad group should have a clear theme that matches its ads
- Use a mix of match types: Broad for discovery, Phrase for relevance, Exact for high-intent
- Always include negative keywords at campaign level to prevent waste

### Bidding Strategy Selection
- MAXIMIZE_CLICKS: Best for new campaigns, awareness goals, or when you lack conversion data
- MAXIMIZE_CONVERSIONS: When you have conversion tracking and want volume
- TARGET_CPA: When you know your target cost per acquisition (need 30+ conversions/month)
- TARGET_ROAS: When you track revenue and want return-based optimization (need 50+ conversions/month)
- MANUAL_CPC: When you want full control over individual keyword bids

### Budget Guidelines
- Start conservative — you can always increase
- Ensure daily budget can support at least 10-20 clicks at expected CPC
- Don't spread budget too thin across too many campaigns
- For search campaigns: budget ≥ (target CPC × 10) per day minimum

### Campaign Types
- SEARCH: Intent-based, keyword-triggered text ads. Best for direct response.
- DISPLAY: Visual banner ads across Google Display Network. Best for awareness.
- PERFORMANCE_MAX: AI-driven across all Google channels. Best with conversion data.
- VIDEO: YouTube ads. Best for brand awareness and consideration.
- DEMAND_GEN: Visual ads on Discover, Gmail, YouTube. Best for demand creation.
- SHOPPING: Product listing ads. Requires product feed.

### Ad Copy in Campaigns
- 5-8 headlines (≤30 chars each), 3-4 descriptions (≤90 chars each) per RSA
- Include the primary keyword in at least 2 headlines
- Include a CTA in at least one headline and description
- Use different angles: features, benefits, urgency, social proof

## Critical Rules
- NEVER set a daily budget above $2,000 unless explicitly instructed
- ALWAYS include at least one geo target
- ALWAYS create negative keywords to prevent wasted spend
- ALWAYS verify headline ≤30 chars, description ≤90 chars

Respond with valid JSON matching the campaignBlueprint schema.`;

export class CampaignBuilderAgent extends BaseAdsAgent {
  constructor() {
    super({
      name: 'CampaignBuilderAgent',
      tier: 'strategy',
    });
  }

  /**
   * Build a complete campaign from research + instructions
   */
  async buildCampaign(input: {
    research: ResearchOutput;
    instructions: string;
    business_description: string;
    target_audience?: string;
    budget_daily_dollars?: number;
    campaign_type?: string;
    landing_page_url?: string;
    geo_targets?: Array<{ country?: string; region?: string; city?: string }>;
    language_targets?: string[];
  }): Promise<CampaignBlueprint> {
    this.logger.info('Building campaign', {
      campaign_type: input.campaign_type || 'auto',
      keywords_available: input.research.keywords.length,
    });

    const prompt = this.buildPrompt(input);

    const blueprint = await this.callStructured<CampaignBlueprint>(
      { system: SYSTEM_PROMPT, prompt },
      campaignBlueprintSchema,
    );

    await this.logAction('campaign_built', `"${blueprint.campaign.name}" — ${blueprint.ad_groups.length} ad groups, ${blueprint.campaign.campaign_type}`);

    return blueprint;
  }

  /**
   * Build the comprehensive prompt with research data
   */
  private buildPrompt(input: {
    research: ResearchOutput;
    instructions: string;
    business_description: string;
    target_audience?: string;
    budget_daily_dollars?: number;
    campaign_type?: string;
    landing_page_url?: string;
    geo_targets?: Array<{ country?: string; region?: string; city?: string }>;
    language_targets?: string[];
  }): string {
    const topKeywords = input.research.keywords
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
      .slice(0, 30);

    const competitorInsights = input.research.competitor_deep_analysis
      ? input.research.competitor_deep_analysis.map((c) =>
          `${c.domain}: ${c.strategic_inference} (Threat: ${c.threat_level})`
        ).join('\n')
      : input.research.competitor_observations.map((c) =>
          `${c.domain}: keywords=${c.observed_keywords?.join(', ')}`
        ).join('\n');

    const opportunities = input.research.market_opportunities
      ? input.research.market_opportunities.map((o) =>
          `- ${o.opportunity} (confidence: ${o.confidence})`
        ).join('\n')
      : 'No specific opportunities identified';

    return `## Campaign Build Brief

**User Instructions:** ${input.instructions}
**Business:** ${input.business_description}
**Target Audience:** ${input.target_audience || 'Infer from business + research'}
**Requested Campaign Type:** ${input.campaign_type || 'Choose the best type based on goals'}
**Daily Budget:** ${input.budget_daily_dollars ? `$${input.budget_daily_dollars}` : 'Suggest an appropriate budget'}
**Landing Page:** ${input.landing_page_url || 'Not provided — use placeholder URLs'}
**Geo Targets:** ${input.geo_targets?.map((g) => g.country || g.region || g.city).join(', ') || 'Suggest based on business'}
**Languages:** ${input.language_targets?.join(', ') || 'en'}

## Research Intelligence

### Top Keywords (ranked by relevance)
${topKeywords.map((kw) => `- "${kw.text}" | Vol: ${kw.avg_monthly_searches} | Comp: ${kw.competition} | Bid: $${kw.suggested_bid_micros ? (kw.suggested_bid_micros / 1_000_000).toFixed(2) : 'N/A'} | Relevance: ${kw.relevance_score || 'N/A'}`).join('\n')}

### Negative Keyword Suggestions
${input.research.negative_keyword_suggestions.join(', ')}

### Competitor Insights
${competitorInsights}

### Market Opportunities
${opportunities}

### Strategic Summary
${input.research.strategic_summary}

## Instructions
1. Design the optimal campaign structure based on the research
2. Group keywords into themed ad groups (5-15 keywords each)
3. Write compelling ad copy for each ad group (headlines ≤30 chars, descriptions ≤90 chars)
4. Set appropriate bids based on keyword competition and suggested bids
5. Include campaign-level negative keywords
6. Provide your reasoning for structural decisions
7. If budget wasn't specified, suggest one based on keyword CPCs and competition

CRITICAL: Verify all character counts. Budget in micros (1,000,000 = $1).

Return valid JSON.`;
  }

  /**
   * QA fix override
   */
  protected getFixSystemPrompt(): string {
    return `You are a Google Ads campaign architect fixing quality errors. Common fixes:
- Budget too high: Reduce to a reasonable amount. $50-500/day is typical for most campaigns.
- Missing ad groups: Add at least one ad group with ads and keywords.
- Headlines over 30 chars: Shorten them. Use "&" instead of "and", abbreviate where possible.
- Descriptions over 90 chars: Condense the message.
- Keyword conflicts: Remove conflicting negative keywords.
- Missing geo targets: Add appropriate geo targets.
Fix ONLY the listed errors. Preserve everything else. Return valid JSON matching the campaignBlueprint schema.`;
  }
}

// Singleton
export const campaignBuilderAgent = new CampaignBuilderAgent();
