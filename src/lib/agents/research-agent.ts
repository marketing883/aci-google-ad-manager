import { BaseAdsAgent } from './base-agent';
import { researchOutputSchema, type ResearchOutput } from '@/schemas/agent-output';
import { comprehensiveKeywordResearch } from '../dataforseo';
import { createGoogleAdsClient } from '../google-ads/client';

// ============================================================
// ResearchAgent — Deep keyword + competitor intelligence
// Model: Sonnet (strategy tier)
// Sources: Google Ads Keyword Planner, DataForSEO, Web Search, Auction Insights
// ============================================================

const SYSTEM_PROMPT = `You are an elite Google Ads research analyst and competitive intelligence expert. Your job is to produce deeply reasoned, actionable intelligence reports.

## Your Capabilities
1. KEYWORD RESEARCH: Analyze keyword data to identify the highest-value opportunities. Consider search volume, competition, cost, and buyer intent.
2. COMPETITOR INTELLIGENCE: Go beyond surface-level analysis. When given competitor data:
   - Analyze their content strategy (what topics, what format, what frequency)
   - Interpret hiring signals (a company hiring ML engineers = building AI products = opportunity to target that space)
   - Identify their ad strategy (what keywords they bid on, what copy they use)
   - Derive strategic inferences (step-by-step reasoning about what the competitor is doing and planning)
3. MARKET OPPORTUNITIES: Identify gaps that competitors are missing. Look for:
   - Keywords with high intent but low competition
   - Services competitors don't cover
   - Geographic markets not well served
   - Audience segments being ignored

## Output Rules
- Be specific with numbers and data points
- Rate threat levels honestly (low/medium/high/critical)
- Provide actionable strategic inferences, not vague observations
- Each competitor analysis should include a clear "opportunities against" section
- Keywords should include relevance scores based on the business description

Respond with valid JSON matching the required schema.`;

export class ResearchAgent extends BaseAdsAgent {
  constructor() {
    super({
      name: 'ResearchAgent',
      tier: 'strategy',
    });
  }

  /**
   * Run comprehensive research
   */
  async research(input: {
    business_description: string;
    seed_keywords?: string[];
    competitor_domains?: string[];
    target_audience?: string;
    geo_location?: number; // DataForSEO location code (2840 = US)
  }): Promise<ResearchOutput> {
    this.logger.info('Starting research', {
      keywords: input.seed_keywords?.length || 0,
      competitors: input.competitor_domains?.length || 0,
    });

    // Gather data from multiple sources in parallel
    const [dataForSEOResults, googleAdsKeywords, competitorContext] = await Promise.all([
      this.getDataForSEOData(input.seed_keywords || [], input.geo_location),
      this.getGoogleAdsKeywords(input.seed_keywords || []),
      this.gatherCompetitorIntel(input.competitor_domains || [], input.business_description),
    ]);

    // Build the prompt with all gathered data
    const prompt = this.buildResearchPrompt(input, dataForSEOResults, googleAdsKeywords, competitorContext);

    // Call LLM for analysis and synthesis
    const output = await this.callStructured<ResearchOutput>(
      { system: SYSTEM_PROMPT, prompt },
      researchOutputSchema,
    );

    // Store competitor data persistently
    await this.storeCompetitorData(output);

    await this.logAction('research_complete', `${output.keywords.length} keywords, ${output.competitor_deep_analysis?.length || 0} competitors analyzed`);

    return output;
  }

  /**
   * Get keyword data from DataForSEO
   */
  private async getDataForSEOData(
    seedKeywords: string[],
    location = 2840,
  ): Promise<string> {
    if (seedKeywords.length === 0) return 'No DataForSEO data (no seed keywords provided)';

    try {
      const results = await Promise.all(
        seedKeywords.slice(0, 5).map((kw) => comprehensiveKeywordResearch(kw, location)),
      );

      return JSON.stringify(results, null, 2);
    } catch (error) {
      this.logger.warn('DataForSEO data fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'DataForSEO data unavailable';
    }
  }

  /**
   * Get keyword ideas from Google Ads Keyword Planner
   */
  private async getGoogleAdsKeywords(seedKeywords: string[]): Promise<string> {
    if (seedKeywords.length === 0) return 'No Google Ads keyword data (no seed keywords)';

    try {
      const client = await createGoogleAdsClient();
      if (!client) return 'Google Ads not connected';

      const results = await client.generateKeywordIdeas(seedKeywords.slice(0, 10));
      return JSON.stringify(results, null, 2);
    } catch (error) {
      this.logger.warn('Google Ads keyword fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 'Google Ads keyword data unavailable';
    }
  }

  /**
   * Gather competitor intelligence from web search
   */
  private async gatherCompetitorIntel(
    domains: string[],
    businessDescription: string,
  ): Promise<string> {
    if (domains.length === 0) {
      return `No specific competitors provided. Use the business description to infer likely competitors: "${businessDescription}"`;
    }

    // For each competitor, we'll ask the AI to analyze based on its knowledge
    // In production, this would integrate with LinkedIn API, web scraping, etc.
    const competitorInfo = domains.map((domain) => ({
      domain,
      instruction: `Analyze ${domain}: their services, recent content themes, likely hiring patterns, ad strategy, and market positioning. Derive strategic inferences.`,
    }));

    return JSON.stringify(competitorInfo, null, 2);
  }

  /**
   * Build the comprehensive research prompt
   */
  private buildResearchPrompt(
    input: {
      business_description: string;
      seed_keywords?: string[];
      competitor_domains?: string[];
      target_audience?: string;
    },
    dataForSEOData: string,
    googleAdsData: string,
    competitorContext: string,
  ): string {
    return `## Research Brief

**Business Description:** ${input.business_description}
**Target Audience:** ${input.target_audience || 'Not specified — infer from business description'}
**Seed Keywords:** ${input.seed_keywords?.join(', ') || 'None — suggest based on business'}
**Competitor Domains:** ${input.competitor_domains?.join(', ') || 'None — discover from data'}

## Data from DataForSEO (keyword volumes, SERP competitors, related terms)
${dataForSEOData}

## Data from Google Ads Keyword Planner (bid estimates, search volumes)
${googleAdsData}

## Competitor Context
${competitorContext}

## Instructions
1. Analyze all data sources and synthesize a comprehensive intelligence report
2. For keywords: rank by relevance to the business, include intent analysis
3. For competitors: provide deep analysis with hiring signal interpretations and strategic inferences
4. Identify market opportunities — gaps competitors are missing
5. Suggest negative keywords to avoid wasted spend
6. Suggest audience segments based on the business and competitor analysis

Return your analysis as structured JSON.`;
  }

  /**
   * Store competitor analysis in the database for incremental tracking
   */
  private async storeCompetitorData(output: ResearchOutput): Promise<void> {
    if (!output.competitor_deep_analysis?.length) return;

    try {
      for (const comp of output.competitor_deep_analysis) {
        // Check if competitor exists
        const { data: existing } = await this.supabase
          .from('competitor_data')
          .select('id, observed_keywords, observed_ads')
          .eq('domain', comp.domain)
          .single();

        if (existing) {
          // Update with new data (merge)
          const mergedKeywords = [
            ...new Set([
              ...(existing.observed_keywords || []).map((k: { text: string }) => k.text),
              ...(comp.ad_presence?.observed_keywords || []),
            ]),
          ].map((text) => ({ text, last_seen: new Date().toISOString() }));

          await this.supabase
            .from('competitor_data')
            .update({
              company_name: comp.company_name || undefined,
              observed_keywords: mergedKeywords,
              observed_ads: comp.ad_presence?.ad_copy_themes?.map((theme) => ({
                description: theme,
                first_seen: new Date().toISOString(),
              })) || existing.observed_ads,
              notes: comp.strategic_inference,
            })
            .eq('id', existing.id);
        } else {
          // Insert new competitor
          await this.supabase.from('competitor_data').insert({
            domain: comp.domain,
            company_name: comp.company_name,
            observed_keywords: (comp.ad_presence?.observed_keywords || []).map((text) => ({
              text,
              first_seen: new Date().toISOString(),
            })),
            observed_ads: (comp.ad_presence?.ad_copy_themes || []).map((theme) => ({
              description: theme,
              first_seen: new Date().toISOString(),
            })),
            notes: comp.strategic_inference,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to store competitor data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * QA fix override — handle keyword/research-specific errors
   */
  protected getFixSystemPrompt(): string {
    return `You are a Google Ads research expert fixing quality check errors in a research report. Fix ONLY the specific errors listed. Common fixes include: removing duplicate keywords, correcting bid suggestions that are too high, adding missing fields. Return valid JSON.`;
  }
}

// Singleton
export const researchAgent = new ResearchAgent();
