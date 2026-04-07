import { createLogger } from './utils/logger';
import type { SerpAdvancedResult } from './dataforseo';
import type { LlmVisibilityResult } from './llm-visibility';
import type {
  GA4TrafficOverview, GA4LandingPage, GA4DeviceSplit,
} from './google-analytics/client';

const logger = createLogger('VisibilityAnalysis');

// ============================================================
// Zero-Hallucination Analysis Engine
// ALL scoring, flagging, and recommendation selection is
// deterministic TypeScript. No LLM touches this code.
// ============================================================

// ---- Thresholds (hardcoded, not AI-decided) ----

export const THRESHOLDS = {
  bounce_rate: { warning: 0.50, critical: 0.70 },
  conversion_rate: { industry_avg: 0.032, poor: 0.01 },
  mobile_gap: { warning: 2.0 },
  cpa_ratio: { warning: 2.0 },
  spend_no_conversion_days: { warning: 7 },
  ctr: { poor: 0.01, good: 0.03, excellent: 0.05 },
  page_sessions_for_signal: 50,
  ai_overview_presence: 0.3,
  avg_session_duration: { poor: 10, good: 60 },
};

// ---- Recommendation Catalog (fixed set, LLM picks from — never invents) ----

export interface Recommendation {
  id: string;
  title: string;
  action: string;
  category: 'visibility' | 'traffic' | 'conversion' | 'spend';
  impact: 'high' | 'medium' | 'low';
}

export const RECOMMENDATION_CATALOG: Record<string, Recommendation> = {
  fix_bounce: {
    id: 'fix_bounce',
    title: 'Reduce bounce rate',
    action: 'Review page load speed, ensure ad headline matches landing page headline, simplify above-the-fold content.',
    category: 'conversion', impact: 'high',
  },
  fix_conversion_rate: {
    id: 'fix_conversion_rate',
    title: 'Improve conversion rate',
    action: 'Simplify the contact form, add client logos/testimonials above the fold, make CTA more prominent.',
    category: 'conversion', impact: 'high',
  },
  earn_ai_citation: {
    id: 'earn_ai_citation',
    title: 'Get cited in AI Overviews',
    action: 'Publish comprehensive, authoritative content on this topic with structured data. AI Overviews cite pages that directly answer the query.',
    category: 'visibility', impact: 'high',
  },
  bid_on_gap_keyword: {
    id: 'bid_on_gap_keyword',
    title: 'Start bidding on keyword',
    action: 'Competitors advertise here but you don\'t. Create an ad group targeting this keyword.',
    category: 'spend', impact: 'medium',
  },
  fix_mobile: {
    id: 'fix_mobile',
    title: 'Fix mobile experience',
    action: 'Mobile converts significantly worse than desktop. Test responsive layout, reduce page weight, simplify forms for mobile.',
    category: 'conversion', impact: 'high',
  },
  pause_waste: {
    id: 'pause_waste',
    title: 'Pause wasted spend',
    action: 'This campaign/keyword has spent with zero conversions. Pause it or test a new landing page.',
    category: 'spend', impact: 'high',
  },
  increase_budget_winner: {
    id: 'increase_budget_winner',
    title: 'Increase budget on winner',
    action: 'This campaign converts well but is budget-limited. Increase daily budget to capture more conversions.',
    category: 'spend', impact: 'medium',
  },
  improve_organic_rank: {
    id: 'improve_organic_rank',
    title: 'Improve organic ranking',
    action: 'You rank but not in top 3. Deepen content, earn backlinks, improve page experience.',
    category: 'visibility', impact: 'medium',
  },
  build_llm_authority: {
    id: 'build_llm_authority',
    title: 'Build brand authority for LLM visibility',
    action: 'LLMs don\'t mention your brand. Publish original research, earn press coverage, get listed in industry directories.',
    category: 'visibility', impact: 'low',
  },
  fix_ad_page_mismatch: {
    id: 'fix_ad_page_mismatch',
    title: 'Fix ad-to-page mismatch',
    action: 'Traffic comes in but leaves immediately. Ensure the landing page headline, offer, and CTA match what the ad promised.',
    category: 'conversion', impact: 'high',
  },
  traffic_up_conversions_down: {
    id: 'traffic_up_conversions_down',
    title: 'Investigate traffic quality',
    action: 'Traffic increased but conversions didn\'t follow. Check for bot traffic, verify conversion tracking, review keyword intent.',
    category: 'traffic', impact: 'high',
  },
  create_organic_content: {
    id: 'create_organic_content',
    title: 'Create content for organic presence',
    action: 'You have no organic ranking for this keyword. Create high-quality content targeting it to earn organic traffic alongside paid.',
    category: 'visibility', impact: 'medium',
  },
  competitor_dominates: {
    id: 'competitor_dominates',
    title: 'Competitor dominates this keyword',
    action: 'A competitor ranks #1 organically and has paid ads. Consider a conquest ad group or create better content to compete.',
    category: 'visibility', impact: 'medium',
  },
  low_session_duration: {
    id: 'low_session_duration',
    title: 'Improve page engagement',
    action: 'Users spend very little time on this page. Add more relevant content, improve readability, or check if the page matches search intent.',
    category: 'conversion', impact: 'medium',
  },
};

// ---- Analysis Flag ----

export interface AnalysisFlag {
  type: string;                         // recommendation catalog key
  metric: string;                       // what metric triggered it
  value: number | string;               // actual value
  threshold: number | string | null;    // threshold crossed (null if N/A)
  context: Record<string, unknown>;     // additional data for template filling
}

// ---- Score Calculations (pure math, no LLM) ----

/**
 * Score organic visibility: how well the brand ranks for target keywords
 */
export function scoreOrganic(
  serpResults: SerpAdvancedResult[],
  domain: string,
): { score: number; flags: AnalysisFlag[] } {
  const flags: AnalysisFlag[] = [];
  if (serpResults.length === 0) return { score: 0, flags };

  let totalScore = 0;
  const domainBase = domain.replace(/^www\./, '').toLowerCase();

  for (const serp of serpResults) {
    const brandResult = serp.organic.find((o) => o.domain.toLowerCase().includes(domainBase));

    if (!brandResult) {
      totalScore += 0;
      flags.push({
        type: 'create_organic_content',
        metric: 'organic_position',
        value: 'not_found',
        threshold: null,
        context: { keyword: serp.keyword },
      });
    } else if (brandResult.position <= 3) {
      totalScore += 100;
    } else if (brandResult.position <= 10) {
      totalScore += 60;
      flags.push({
        type: 'improve_organic_rank',
        metric: 'organic_position',
        value: brandResult.position,
        threshold: 3,
        context: { keyword: serp.keyword, position: brandResult.position },
      });
    } else {
      totalScore += 20;
      flags.push({
        type: 'improve_organic_rank',
        metric: 'organic_position',
        value: brandResult.position,
        threshold: 10,
        context: { keyword: serp.keyword, position: brandResult.position },
      });
    }

    // Check if competitor dominates (organic #1 + paid presence)
    const topOrganic = serp.organic[0];
    const hasPaid = serp.paid.length > 0;
    if (topOrganic && !topOrganic.domain.toLowerCase().includes(domainBase) && hasPaid) {
      const competitorInPaid = serp.paid.find((p) => p.domain === topOrganic.domain);
      if (competitorInPaid) {
        flags.push({
          type: 'competitor_dominates',
          metric: 'competitor_presence',
          value: topOrganic.domain,
          threshold: null,
          context: { keyword: serp.keyword, competitor: topOrganic.domain, position: topOrganic.position },
        });
      }
    }
  }

  return { score: Math.round(totalScore / serpResults.length), flags };
}

/**
 * Score AI Overview visibility: is the brand cited in AI answers?
 */
export function scoreAiOverview(
  serpResults: SerpAdvancedResult[],
  domain: string,
): { score: number; flags: AnalysisFlag[] } {
  const flags: AnalysisFlag[] = [];
  const domainBase = domain.replace(/^www\./, '').toLowerCase();

  const withOverview = serpResults.filter((s) => s.ai_overview_exists);
  if (withOverview.length === 0) return { score: 50, flags }; // No AI overviews = neutral

  let citedCount = 0;
  for (const serp of withOverview) {
    const isCited = serp.ai_overview_citations.some(
      (c) => c.domain.toLowerCase().includes(domainBase),
    );
    if (isCited) {
      citedCount++;
    } else {
      const competitorsCited = serp.ai_overview_citations
        .map((c) => c.domain)
        .filter((d) => !d.includes(domainBase))
        .slice(0, 3);
      flags.push({
        type: 'earn_ai_citation',
        metric: 'ai_overview_citation',
        value: 'not_cited',
        threshold: null,
        context: { keyword: serp.keyword, competitors_cited: competitorsCited },
      });
    }
  }

  const score = Math.round((citedCount / withOverview.length) * 100);
  return { score, flags };
}

/**
 * Score paid search presence: does the brand have ads for target keywords?
 */
export function scorePaid(
  serpResults: SerpAdvancedResult[],
  domain: string,
): { score: number; flags: AnalysisFlag[] } {
  const flags: AnalysisFlag[] = [];
  if (serpResults.length === 0) return { score: 0, flags };

  const domainBase = domain.replace(/^www\./, '').toLowerCase();
  let presentCount = 0;

  for (const serp of serpResults) {
    const brandAd = serp.paid.find((p) => p.domain.toLowerCase().includes(domainBase));
    if (brandAd) {
      presentCount++;
    } else if (serp.paid.length > 0) {
      // Competitors have ads but brand doesn't
      flags.push({
        type: 'bid_on_gap_keyword',
        metric: 'paid_presence',
        value: 'not_bidding',
        threshold: null,
        context: {
          keyword: serp.keyword,
          competitor_ads: serp.paid.slice(0, 3).map((p) => p.domain),
        },
      });
    }
  }

  const score = Math.round((presentCount / serpResults.length) * 100);
  return { score, flags };
}

/**
 * Score LLM visibility: is the brand mentioned in AI answers?
 */
export function scoreLlm(
  llmResults: LlmVisibilityResult[],
): { score: number; flags: AnalysisFlag[] } {
  const flags: AnalysisFlag[] = [];
  if (llmResults.length === 0) return { score: 0, flags };

  const mentionedCount = llmResults.filter((r) => r.mentioned).length;

  if (mentionedCount === 0) {
    flags.push({
      type: 'build_llm_authority',
      metric: 'llm_mention_rate',
      value: 0,
      threshold: null,
      context: { questions_asked: llmResults.length },
    });
  }

  const score = Math.round((mentionedCount / llmResults.length) * 100);
  return { score, flags };
}

/**
 * Score website health from GA4 data
 */
export function scoreWebsiteHealth(
  traffic: GA4TrafficOverview | null,
  landingPages: GA4LandingPage[],
  devices: GA4DeviceSplit[],
): { score: number; flags: AnalysisFlag[] } {
  const flags: AnalysisFlag[] = [];
  if (!traffic) return { score: 0, flags };

  let score = 50; // Start at neutral

  // Bounce rate scoring (25% weight)
  if (traffic.bounce_rate >= THRESHOLDS.bounce_rate.critical) {
    score -= 15;
    flags.push({
      type: 'fix_bounce',
      metric: 'bounce_rate',
      value: traffic.bounce_rate,
      threshold: THRESHOLDS.bounce_rate.warning,
      context: { sessions: traffic.sessions },
    });
  } else if (traffic.bounce_rate >= THRESHOLDS.bounce_rate.warning) {
    score -= 5;
  } else {
    score += 10;
  }

  // Engagement rate
  if (traffic.engagement_rate > 0.6) score += 10;
  else if (traffic.engagement_rate < 0.3) score -= 10;

  // Landing page analysis
  for (const page of landingPages) {
    if (page.sessions < THRESHOLDS.page_sessions_for_signal) continue;

    // High bounce on specific page
    if (page.bounce_rate >= THRESHOLDS.bounce_rate.critical) {
      flags.push({
        type: 'fix_ad_page_mismatch',
        metric: 'page_bounce_rate',
        value: page.bounce_rate,
        threshold: THRESHOLDS.bounce_rate.critical,
        context: { page: page.page, sessions: page.sessions },
      });
    }

    // Low conversion rate
    if (page.conversion_rate < THRESHOLDS.conversion_rate.poor && page.sessions > 100) {
      flags.push({
        type: 'fix_conversion_rate',
        metric: 'page_conversion_rate',
        value: page.conversion_rate,
        threshold: THRESHOLDS.conversion_rate.industry_avg,
        context: { page: page.page, sessions: page.sessions, conversions: page.conversions },
      });
    }

    // Very low session duration
    if (page.avg_duration < THRESHOLDS.avg_session_duration.poor && page.sessions > 50) {
      flags.push({
        type: 'low_session_duration',
        metric: 'avg_session_duration',
        value: page.avg_duration,
        threshold: THRESHOLDS.avg_session_duration.good,
        context: { page: page.page, sessions: page.sessions },
      });
    }
  }

  // Mobile vs desktop gap
  const mobile = devices.find((d) => d.device === 'mobile');
  const desktop = devices.find((d) => d.device === 'desktop');
  if (mobile && desktop && desktop.conversion_rate > 0) {
    const gap = desktop.conversion_rate / (mobile.conversion_rate || 0.001);
    if (gap >= THRESHOLDS.mobile_gap.warning) {
      score -= 10;
      flags.push({
        type: 'fix_mobile',
        metric: 'mobile_desktop_gap',
        value: gap,
        threshold: THRESHOLDS.mobile_gap.warning,
        context: {
          mobile_rate: mobile.conversion_rate,
          desktop_rate: desktop.conversion_rate,
          mobile_sessions: mobile.sessions,
        },
      });
    }
  }

  return { score: Math.max(0, Math.min(100, score)), flags };
}

// ---- Overall Score ----

export function calculateOverallScore(scores: {
  organic: number;
  ai_overview: number;
  paid: number;
  llm: number;
  website: number;
}): number {
  // Weighted: organic 25%, AI overview 20%, paid 25%, LLM 10%, website 20%
  return Math.round(
    scores.organic * 0.25 +
    scores.ai_overview * 0.20 +
    scores.paid * 0.25 +
    scores.llm * 0.10 +
    scores.website * 0.20
  );
}

// ---- Recommendation Selection (from flags → catalog) ----

export interface SelectedRecommendation {
  recommendation: Recommendation;
  data: Record<string, unknown>;  // context data for template filling
  priority: number;               // 1 = highest
}

/**
 * Select and prioritize recommendations from analysis flags.
 * Uses the fixed catalog — never invents new recommendations.
 */
export function selectRecommendations(
  flags: AnalysisFlag[],
): SelectedRecommendation[] {
  // Deduplicate by type (keep the most impactful instance)
  const byType = new Map<string, AnalysisFlag>();
  for (const flag of flags) {
    const existing = byType.get(flag.type);
    if (!existing) {
      byType.set(flag.type, flag);
    }
    // Keep first occurrence (usually most important)
  }

  const selected: SelectedRecommendation[] = [];
  const impactOrder = { high: 1, medium: 2, low: 3 };

  for (const [type, flag] of byType) {
    const rec = RECOMMENDATION_CATALOG[type];
    if (!rec) {
      logger.warn(`No catalog entry for flag type: ${type}`);
      continue;
    }

    selected.push({
      recommendation: rec,
      data: { ...flag.context, metric: flag.metric, value: flag.value, threshold: flag.threshold },
      priority: impactOrder[rec.impact],
    });
  }

  // Sort by priority (high impact first), then by category
  return selected.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.recommendation.category.localeCompare(b.recommendation.category);
  });
}
