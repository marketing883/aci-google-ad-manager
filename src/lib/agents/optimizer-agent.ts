import { BaseAdsAgent } from './base-agent';
import type { Recommendation } from '@/schemas/approval';

// ============================================================
// OptimizerAgent — the brain of the automation loop
// ============================================================
//
// Runs every 2 hours via the run-optimizer cron. For each active campaign,
// kicks off four deterministic sub-analyses in parallel, each reading from
// the snapshots populated by the sync layer:
//
//   1. bid-efficiency    — per-keyword bid adjustments based on CPA vs
//                          campaign average
//   2. budget-pacing     — campaign budget up/down based on projected
//                          month-end spend vs budget intent
//   3. quality-score-decay — pause low-QS high-CPA keywords; flag QS drops
//   4. landing-page-roi  — boost bids on keywords in ad groups that point
//                          to the campaign's best-converting landing page
//                          (cross-channel: GA4 landing page data × Ads)
//
// ZERO LLM calls in the core logic. Every recommendation is derived from
// numeric thresholds and joined DB reads. LLM-generated rationales can be
// layered on later — today each rec ships with a templated explanation
// that's grounded in the same numbers.
//
// Output: Recommendation[] ready for QASentinel.validateRecommendation()
// and then the approval_queue.
// ============================================================

// Minimum activity thresholds before a sub-analysis acts on a keyword or
// campaign. Prevents recommending bid changes on keywords with 3 clicks.
const THRESHOLDS = {
  // Bid efficiency
  minKeywordClicks: 30, // per-keyword clicks in the lookback window
  highCpaMultiple: 1.5, // keyword CPA > 1.5× campaign avg → cut bid
  lowCpaMultiple: 0.5, // keyword CPA < 0.5× campaign avg → raise bid
  bidCutPct: 0.1, // 10% reduction for high-CPA keywords
  bidRaisePct: 0.1, // 10% increase for low-CPA keywords
  zeroConvSpendMultiple: 0.5, // 0 conv keyword with cost > 0.5× campaign avg CPA → cut 15%
  zeroConvBidCutPct: 0.15,

  // Budget pacing
  pacingLookbackDays: 14, // base daily-spend projection on last N days
  overspendThreshold: 1.1, // projected > 110% of intent → cut budget
  underspendThreshold: 0.8, // projected < 80% of intent → scale up IF converting
  budgetCutPct: 0.15, // 15% cut on overspend
  budgetRaisePct: 0.2, // 20% raise on underspend (review-tier due to size)

  // Quality score
  qsLowThreshold: 3, // QS ≤ 3 is actionably bad
  qsDecayDrop: 2, // QS drop ≥ 2 points week-over-week flags decay
  qsMinSnapshots: 4, // need ≥ 4 snapshots with QS to compute a trend

  // Landing-page ROI
  lpConversionRateMultiple: 2.0, // page converts at 2× campaign avg → boost
  lpMinSessions: 100, // statistical significance floor
} as const;

// Helper — build the Google Ads resource_name a mutate handler expects.
// Keywords: customers/{customerId}/adGroupCriteria/{adGroupId}~{criterionId}
function keywordResourceName(
  customerId: string,
  googleAdGroupId: string,
  googleKeywordId: string,
): string {
  return `customers/${customerId}/adGroupCriteria/${googleAdGroupId}~${googleKeywordId}`;
}

// Campaign resource_name: customers/{customerId}/campaigns/{campaignId}
function campaignResourceName(customerId: string, googleCampaignId: string): string {
  return `customers/${customerId}/campaigns/${googleCampaignId}`;
}

// Fetch customer_id once and cache on the instance so we don't re-query per
// sub-analysis. Relies on the single-tenant assumption (confirmed at
// google_ads_accounts.is_active = true being unique).
interface CachedAccount {
  customer_id: string;
}

interface CampaignRef {
  id: string;
  name: string;
  google_campaign_id: string;
  budget_amount_micros: number;
}

interface KeywordRollup {
  id: string;
  text: string;
  match_type: string;
  google_keyword_id: string | null;
  cpc_bid_micros: number | null;
  ad_group_id: string;
  google_ad_group_id: string | null;
  clicks: number;
  cost_micros: number;
  conversions: number;
  latest_quality_score: number | null;
  prior_week_quality_score: number | null;
}

interface CampaignDailyPoint {
  date: string;
  cost_micros: number;
  conversions: number;
  clicks: number;
}

export class OptimizerAgent extends BaseAdsAgent {
  private accountCache: CachedAccount | null = null;

  constructor() {
    super({ name: 'OptimizerAgent', tier: 'fast' });
  }

  /**
   * Main entry point. Returns all recommendations for the given campaign
   * across every sub-analysis. Caller (the run-optimizer cron) is
   * responsible for running these through QASentinel and writing to
   * approval_queue.
   */
  async optimize(campaignId: string): Promise<Recommendation[]> {
    const campaign = await this.loadCampaign(campaignId);
    if (!campaign) {
      this.logger.warn(`Campaign not found: ${campaignId}`);
      return [];
    }
    const account = await this.loadAccount();
    if (!account) {
      this.logger.warn('No active Google Ads account — skipping optimizer');
      return [];
    }

    // Run all four in parallel — they read independently. Catch per-analysis
    // errors so one failure doesn't nuke the whole run.
    const [bidRecs, budgetRecs, qsRecs, lpRecs] = await Promise.all([
      this.bidEfficiency(campaign, account).catch((e) => {
        this.logger.error(`bid-efficiency failed for ${campaign.name}`, {
          error: (e as Error).message,
        });
        return [];
      }),
      this.budgetPacing(campaign, account).catch((e) => {
        this.logger.error(`budget-pacing failed for ${campaign.name}`, {
          error: (e as Error).message,
        });
        return [];
      }),
      this.qualityScoreDecay(campaign, account).catch((e) => {
        this.logger.error(`quality-score-decay failed for ${campaign.name}`, {
          error: (e as Error).message,
        });
        return [];
      }),
      this.landingPageRoi(campaign, account).catch((e) => {
        this.logger.error(`landing-page-roi failed for ${campaign.name}`, {
          error: (e as Error).message,
        });
        return [];
      }),
    ]);

    const all = [...bidRecs, ...budgetRecs, ...qsRecs, ...lpRecs];
    this.logger.info(
      `Generated ${all.length} recommendations for ${campaign.name}`,
      {
        bid: bidRecs.length,
        budget: budgetRecs.length,
        qs: qsRecs.length,
        lp: lpRecs.length,
      },
    );
    return all;
  }

  // ==========================================================
  // Sub-analysis 1 — bid efficiency
  // ==========================================================
  // For each keyword in the campaign, compare its 30-day CPA to the
  // campaign average and adjust the bid in a size-capped direction.
  // Three signal shapes:
  //
  //   (a) cost > 0, conversions = 0, cost > 0.5× campaign-avg-CPA
  //       → cut bid 15% (auto-eligible — pure waste control)
  //   (b) conversions > 0, CPA > 1.5× campaign avg
  //       → cut bid 10% (auto-eligible)
  //   (c) conversions > 0, CPA < 0.5× campaign avg, clicks ≥ 30
  //       → raise bid 10% (auto-eligible — scale winner)
  //
  // All three cap the change within the QASentinel auto-apply window (±15%)
  // so they're safe to apply without human review if the user opts in.
  private async bidEfficiency(
    campaign: CampaignRef,
    account: CachedAccount,
  ): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];
    const keywords = await this.loadKeywordsWithPerformance(campaign.id, 30);
    if (keywords.length === 0) return recs;

    // Campaign average CPA (only over converting keywords — mirrors how
    // most practitioners compute "campaign CPA"). If no conversions in
    // the whole campaign, we can't benchmark → skip the analysis.
    const totalCost = keywords.reduce((s, k) => s + k.cost_micros, 0);
    const totalConv = keywords.reduce((s, k) => s + k.conversions, 0);
    const campaignAvgCpaMicros = totalConv > 0 ? totalCost / totalConv : null;
    if (campaignAvgCpaMicros === null || campaignAvgCpaMicros <= 0) return recs;

    for (const kw of keywords) {
      if (
        kw.clicks < THRESHOLDS.minKeywordClicks ||
        !kw.google_keyword_id ||
        !kw.google_ad_group_id ||
        !kw.cpc_bid_micros ||
        kw.cpc_bid_micros <= 0
      ) {
        continue;
      }

      const resourceName = keywordResourceName(
        account.customer_id,
        kw.google_ad_group_id,
        kw.google_keyword_id,
      );
      const currentBid = kw.cpc_bid_micros;

      // Shape (a) — zero-conversion spend
      if (
        kw.conversions === 0 &&
        kw.cost_micros >
          campaignAvgCpaMicros * THRESHOLDS.zeroConvSpendMultiple
      ) {
        const newBid = Math.max(
          1,
          Math.round(currentBid * (1 - THRESHOLDS.zeroConvBidCutPct)),
        );
        recs.push({
          action_type: 'update_bid',
          entity_type: 'keyword',
          entity_id: kw.id,
          entity_name: kw.text,
          payload: {
            resource_name: resourceName,
            new_bid_micros: newBid,
            cpc_bid_micros: newBid,
          },
          previous_state: {
            cpc_bid_micros: currentBid,
            clicks_30d: kw.clicks,
            cost_30d_micros: kw.cost_micros,
            conversions_30d: 0,
          },
          ai_reasoning: `"${kw.text}" spent $${(kw.cost_micros / 1_000_000).toFixed(2)} across ${kw.clicks} clicks over 30 days with 0 conversions — that's ${(kw.cost_micros / campaignAvgCpaMicros).toFixed(1)}× the campaign's average cost-per-conversion. Cutting bid 15% to limit further waste while the keyword stays active for monitoring.`,
          confidence_score: 0.75,
          priority: 'normal',
          agent_name: 'OptimizerAgent',
          optimization_source: 'bid-efficiency',
          predicted_impact: {
            cost_delta_micros: -Math.round(kw.cost_micros * 0.15),
            confidence: 0.6,
            timeframe: 'monthly',
            explanation:
              'Bid reduction of 15% typically lowers impression volume proportionally on low-performing keywords. Expected ~15% spend reduction.',
          },
          risk_tier: 'auto',
        });
        continue;
      }

      if (kw.conversions > 0) {
        const kwCpaMicros = kw.cost_micros / kw.conversions;

        // Shape (b) — high CPA
        if (kwCpaMicros > campaignAvgCpaMicros * THRESHOLDS.highCpaMultiple) {
          const newBid = Math.max(
            1,
            Math.round(currentBid * (1 - THRESHOLDS.bidCutPct)),
          );
          recs.push({
            action_type: 'update_bid',
            entity_type: 'keyword',
            entity_id: kw.id,
            entity_name: kw.text,
            payload: {
              resource_name: resourceName,
              new_bid_micros: newBid,
              cpc_bid_micros: newBid,
            },
            previous_state: {
              cpc_bid_micros: currentBid,
              clicks_30d: kw.clicks,
              cost_30d_micros: kw.cost_micros,
              conversions_30d: kw.conversions,
              cpa_30d_micros: kwCpaMicros,
            },
            ai_reasoning: `"${kw.text}" has a CPA of $${(kwCpaMicros / 1_000_000).toFixed(2)} over 30 days — ${(kwCpaMicros / campaignAvgCpaMicros).toFixed(1)}× the campaign average of $${(campaignAvgCpaMicros / 1_000_000).toFixed(2)}. Reducing bid 10% to lower CPC and improve efficiency.`,
            confidence_score: 0.8,
            priority: 'normal',
            agent_name: 'OptimizerAgent',
            optimization_source: 'bid-efficiency',
            predicted_impact: {
              cpa_delta_micros: -Math.round(kwCpaMicros * 0.08),
              cost_delta_micros: -Math.round(kw.cost_micros * 0.1),
              confidence: 0.65,
              timeframe: 'monthly',
              explanation:
                'Lower bid reduces average CPC; conversion volume typically drops less than proportionally on high-CPA keywords, improving CPA.',
            },
            risk_tier: 'auto',
          });
          continue;
        }

        // Shape (c) — low CPA (scale winner)
        if (kwCpaMicros < campaignAvgCpaMicros * THRESHOLDS.lowCpaMultiple) {
          const newBid = Math.round(currentBid * (1 + THRESHOLDS.bidRaisePct));
          recs.push({
            action_type: 'update_bid',
            entity_type: 'keyword',
            entity_id: kw.id,
            entity_name: kw.text,
            payload: {
              resource_name: resourceName,
              new_bid_micros: newBid,
              cpc_bid_micros: newBid,
            },
            previous_state: {
              cpc_bid_micros: currentBid,
              clicks_30d: kw.clicks,
              cost_30d_micros: kw.cost_micros,
              conversions_30d: kw.conversions,
              cpa_30d_micros: kwCpaMicros,
            },
            ai_reasoning: `"${kw.text}" has a CPA of $${(kwCpaMicros / 1_000_000).toFixed(2)} — ${((kwCpaMicros / campaignAvgCpaMicros) * 100).toFixed(0)}% of the campaign average. This keyword is a winner; raising bid 10% to capture more traffic at this efficiency.`,
            confidence_score: 0.75,
            priority: 'high',
            agent_name: 'OptimizerAgent',
            optimization_source: 'bid-efficiency',
            predicted_impact: {
              conversion_delta: Math.round(kw.conversions * 0.12),
              cost_delta_micros: Math.round(kw.cost_micros * 0.15),
              confidence: 0.6,
              timeframe: 'monthly',
              explanation:
                '10% bid raise typically captures 10–15% more impressions on efficient keywords. Conversion volume expected to scale at current CPA.',
            },
            risk_tier: 'auto',
          });
        }
      }
    }

    return recs;
  }

  // ==========================================================
  // Sub-analysis 2 — budget pacing
  // ==========================================================
  // Projects the campaign's month-end spend from the last 14 days of daily
  // cost and compares to (budget_amount_micros × days_in_month). Recommends
  // budget adjustments when projection is materially off intent.
  //
  // Direction + magnitude:
  //   - projection > 110% of intent → cut budget 15% (review-tier — 15% > 20%
  //     threshold, but budget changes should always be human-reviewed
  //     regardless; QASentinel will enforce review-tier anyway)
  //   - projection < 80% AND converting healthily → raise budget 20% (review)
  private async budgetPacing(
    campaign: CampaignRef,
    account: CachedAccount,
  ): Promise<Recommendation[]> {
    if (!campaign.budget_amount_micros || campaign.budget_amount_micros <= 0) {
      return [];
    }

    const daily = await this.loadCampaignDailySpend(
      campaign.id,
      THRESHOLDS.pacingLookbackDays,
    );
    if (daily.length < 7) return []; // Need at least a week of signal

    // Average daily spend over lookback window
    const totalCost = daily.reduce((s, d) => s + d.cost_micros, 0);
    const totalConv = daily.reduce((s, d) => s + d.conversions, 0);
    const avgDailyCost = totalCost / daily.length;

    const now = new Date();
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const daysElapsed = now.getDate();
    const daysRemaining = daysInMonth - daysElapsed;

    // Month-to-date actual spend: sum daily rows that fall within current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const mtdCost = daily
      .filter((d) => d.date >= monthStart)
      .reduce((s, d) => s + d.cost_micros, 0);

    const projectedMonthEnd = mtdCost + avgDailyCost * daysRemaining;
    const monthlyIntent = campaign.budget_amount_micros * daysInMonth;
    const ratio = projectedMonthEnd / monthlyIntent;

    const resourceName = campaignResourceName(
      account.customer_id,
      campaign.google_campaign_id,
    );

    if (ratio > THRESHOLDS.overspendThreshold) {
      // Overspending — cut daily budget to bring projection back in line.
      const newBudget = Math.max(
        1,
        Math.round(campaign.budget_amount_micros * (1 - THRESHOLDS.budgetCutPct)),
      );
      return [
        {
          action_type: 'update_campaign_budget',
          entity_type: 'campaign',
          entity_id: campaign.id,
          entity_name: campaign.name,
          payload: {
            resource_name: resourceName,
            budget_amount_micros: newBudget,
          },
          previous_state: {
            budget_amount_micros: campaign.budget_amount_micros,
            mtd_cost_micros: mtdCost,
            avg_daily_cost_micros: Math.round(avgDailyCost),
            projected_month_end_micros: Math.round(projectedMonthEnd),
          },
          ai_reasoning: `"${campaign.name}" is pacing to $${(projectedMonthEnd / 1_000_000).toFixed(0)} this month vs budgeted $${(monthlyIntent / 1_000_000).toFixed(0)} — that's ${(ratio * 100).toFixed(0)}% of intent. Reducing daily budget 15% to pull projection back in line.`,
          confidence_score: 0.85,
          priority: ratio > 1.25 ? 'urgent' : 'high',
          agent_name: 'OptimizerAgent',
          optimization_source: 'budget-pacing',
          predicted_impact: {
            cost_delta_micros: -Math.round(
              (projectedMonthEnd - monthlyIntent) * 0.9,
            ),
            confidence: 0.75,
            timeframe: 'monthly',
            explanation:
              '15% daily-budget reduction applied across remaining days in month typically closes the projection gap by ~90%.',
          },
          // Budget changes are always review-tier regardless of delta size.
          // QASentinel will confirm and downgrade if needed.
          risk_tier: 'review',
        },
      ];
    }

    if (ratio < THRESHOLDS.underspendThreshold && totalConv > 0) {
      // Underspending AND converting — scale up.
      const newBudget = Math.round(
        campaign.budget_amount_micros * (1 + THRESHOLDS.budgetRaisePct),
      );
      return [
        {
          action_type: 'update_campaign_budget',
          entity_type: 'campaign',
          entity_id: campaign.id,
          entity_name: campaign.name,
          payload: {
            resource_name: resourceName,
            budget_amount_micros: newBudget,
          },
          previous_state: {
            budget_amount_micros: campaign.budget_amount_micros,
            mtd_cost_micros: mtdCost,
            avg_daily_cost_micros: Math.round(avgDailyCost),
            projected_month_end_micros: Math.round(projectedMonthEnd),
            conversions_14d: totalConv,
          },
          ai_reasoning: `"${campaign.name}" is pacing to only ${(ratio * 100).toFixed(0)}% of intent ($${(projectedMonthEnd / 1_000_000).toFixed(0)} projected vs $${(monthlyIntent / 1_000_000).toFixed(0)} budgeted) with ${totalConv} conversions in the last ${daily.length} days. This campaign is converting and budget-limited. Raising daily budget 20% to capture more demand.`,
          confidence_score: 0.75,
          priority: 'high',
          agent_name: 'OptimizerAgent',
          optimization_source: 'budget-pacing',
          predicted_impact: {
            conversion_delta: Math.round(totalConv * (30 / daily.length) * 0.2),
            cost_delta_micros: Math.round(
              avgDailyCost * daysRemaining * 0.2,
            ),
            confidence: 0.65,
            timeframe: 'monthly',
            explanation:
              'Budget raise typically scales conversions linearly on underspending campaigns; projecting 20% more conversions at current CPA.',
          },
          risk_tier: 'review',
        },
      ];
    }

    return [];
  }

  // ==========================================================
  // Sub-analysis 3 — quality-score decay
  // ==========================================================
  // Two signal shapes:
  //
  //   (a) Current QS ≤ 3 AND keyword has conversions but high CPA
  //       → recommend pause (review — pausing converting keywords needs eyes)
  //
  //   (b) Current QS ≤ 3 AND keyword has 0 conversions AND significant cost
  //       → recommend pause (auto — pure waste, already losing money)
  //
  // We don't surface QS drops without action — that's a Phase 2 concern
  // once we have a richer "alert" primitive. For now, QS only affects the
  // pause decision.
  private async qualityScoreDecay(
    campaign: CampaignRef,
    _account: CachedAccount,
  ): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];
    const keywords = await this.loadKeywordsWithPerformance(campaign.id, 30);
    if (keywords.length === 0) return recs;

    // Campaign avg CPA for comparison (same pattern as bid-efficiency)
    const totalCost = keywords.reduce((s, k) => s + k.cost_micros, 0);
    const totalConv = keywords.reduce((s, k) => s + k.conversions, 0);
    const campaignAvgCpaMicros = totalConv > 0 ? totalCost / totalConv : null;

    for (const kw of keywords) {
      if (
        kw.latest_quality_score === null ||
        kw.latest_quality_score > THRESHOLDS.qsLowThreshold
      ) {
        continue;
      }

      // Shape (b): low QS + 0 conversions + material spend → pause (auto)
      if (
        kw.conversions === 0 &&
        kw.cost_micros >= 5_000_000 // ≥ $5 spent with no return
      ) {
        recs.push({
          action_type: 'pause_keyword',
          entity_type: 'keyword',
          entity_id: kw.id,
          entity_name: kw.text,
          payload: {
            keyword_id: kw.id,
            status: 'PAUSED',
          },
          previous_state: {
            status: 'ENABLED',
            quality_score: kw.latest_quality_score,
            clicks_30d: kw.clicks,
            cost_30d_micros: kw.cost_micros,
            conversions_30d: 0,
          },
          ai_reasoning: `"${kw.text}" has Quality Score ${kw.latest_quality_score}/10 and spent $${(kw.cost_micros / 1_000_000).toFixed(2)} over 30 days with 0 conversions. Low QS means Google is charging premium CPC on an irrelevant match — pausing stops the bleeding.`,
          confidence_score: 0.85,
          priority: 'high',
          agent_name: 'OptimizerAgent',
          optimization_source: 'quality-score-decay',
          predicted_impact: {
            cost_delta_micros: -kw.cost_micros,
            confidence: 0.9,
            timeframe: 'monthly',
            explanation:
              'Pausing eliminates all spend on this keyword. High-confidence savings; may also improve ad group QS over time.',
          },
          risk_tier: 'auto',
        });
        continue;
      }

      // Shape (a): low QS + converting but high CPA → pause (review)
      if (
        kw.conversions > 0 &&
        campaignAvgCpaMicros !== null &&
        kw.cost_micros / kw.conversions > campaignAvgCpaMicros * 2
      ) {
        const kwCpaMicros = kw.cost_micros / kw.conversions;
        recs.push({
          action_type: 'pause_keyword',
          entity_type: 'keyword',
          entity_id: kw.id,
          entity_name: kw.text,
          payload: {
            keyword_id: kw.id,
            status: 'PAUSED',
          },
          previous_state: {
            status: 'ENABLED',
            quality_score: kw.latest_quality_score,
            clicks_30d: kw.clicks,
            cost_30d_micros: kw.cost_micros,
            conversions_30d: kw.conversions,
            cpa_30d_micros: kwCpaMicros,
          },
          ai_reasoning: `"${kw.text}" has Quality Score ${kw.latest_quality_score}/10 and a CPA of $${(kwCpaMicros / 1_000_000).toFixed(2)} — ${(kwCpaMicros / campaignAvgCpaMicros).toFixed(1)}× the campaign average. Low QS is forcing an inefficient CPC; this keyword's economics are unlikely to recover without a landing-page or ad-copy rewrite.`,
          confidence_score: 0.65,
          priority: 'normal',
          agent_name: 'OptimizerAgent',
          optimization_source: 'quality-score-decay',
          predicted_impact: {
            cost_delta_micros: -kw.cost_micros,
            conversion_delta: -kw.conversions,
            cpa_delta_micros: null as unknown as undefined,
            confidence: 0.55,
            timeframe: 'monthly',
            explanation:
              "Pausing removes the conversions this keyword contributes but at a high CPA. Net ROAS improvement depends on whether the freed budget goes to a more efficient keyword.",
          },
          risk_tier: 'review',
        });
      }
    }

    return recs;
  }

  // ==========================================================
  // Sub-analysis 4 — landing-page ROI
  // ==========================================================
  // Cross-channel signal: GA4's ad_traffic landing-page report tells us
  // which pages convert best FOR AD-SOURCED SESSIONS. If a page is
  // converting at >2× the campaign average conversion rate but the ad
  // groups pointing to it aren't being bid aggressively, we're leaving
  // ROI on the table.
  //
  // For Phase 1 the action is a targeted bid raise on the single highest-
  // volume keyword in each ad group whose ads point to a top landing
  // page. Conservative — +10% bid, auto-tier.
  private async landingPageRoi(
    campaign: CampaignRef,
    account: CachedAccount,
  ): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];

    // Pull the most recent analytics snapshot
    const { data: snap } = await this.supabase
      .from('analytics_snapshots')
      .select('ad_traffic, traffic, conversions')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!snap || !snap.ad_traffic) return recs;

    const adPages = snap.ad_traffic as Array<{
      page: string;
      sessions: number;
      conversions: number;
    }>;
    if (!Array.isArray(adPages) || adPages.length === 0) return recs;

    // Compute avg conversion rate across ad-sourced pages
    const totalSessions = adPages.reduce((s, p) => s + (p.sessions || 0), 0);
    const totalConv = adPages.reduce((s, p) => s + (p.conversions || 0), 0);
    if (totalSessions < THRESHOLDS.lpMinSessions || totalConv === 0) return recs;
    const avgConvRate = totalConv / totalSessions;

    // Find pages that convert at >2× avg with enough volume to be signal
    const winners = adPages.filter(
      (p) =>
        p.sessions >= THRESHOLDS.lpMinSessions &&
        p.conversions > 0 &&
        p.conversions / p.sessions >
          avgConvRate * THRESHOLDS.lpConversionRateMultiple,
    );
    if (winners.length === 0) return recs;

    // For each winner, find ad groups in THIS CAMPAIGN whose ads' final_urls
    // include that page. For those ad groups, find the top-converting
    // keyword and bump its bid 10%.
    for (const page of winners) {
      const adGroupIds = await this.findAdGroupsLinkingTo(campaign.id, page.page);
      if (adGroupIds.length === 0) continue;

      for (const agId of adGroupIds) {
        const topKw = await this.findTopConvertingKeyword(agId);
        if (
          !topKw ||
          !topKw.google_keyword_id ||
          !topKw.google_ad_group_id ||
          !topKw.cpc_bid_micros
        ) {
          continue;
        }

        const newBid = Math.round(topKw.cpc_bid_micros * 1.1);
        const resourceName = keywordResourceName(
          account.customer_id,
          topKw.google_ad_group_id,
          topKw.google_keyword_id,
        );

        recs.push({
          action_type: 'update_bid',
          entity_type: 'keyword',
          entity_id: topKw.id,
          entity_name: topKw.text,
          payload: {
            resource_name: resourceName,
            new_bid_micros: newBid,
            cpc_bid_micros: newBid,
          },
          previous_state: {
            cpc_bid_micros: topKw.cpc_bid_micros,
            landing_page: page.page,
            landing_page_sessions: page.sessions,
            landing_page_conversions: page.conversions,
          },
          ai_reasoning: `Landing page ${page.page} converts ad traffic at ${((page.conversions / page.sessions) * 100).toFixed(1)}% — ${(page.conversions / page.sessions / avgConvRate).toFixed(1)}× the campaign-wide ad-traffic average. The top-converting keyword pointing to this page is "${topKw.text}"; raising its bid 10% to capture more of the demand that's clearly working.`,
          confidence_score: 0.7,
          priority: 'high',
          agent_name: 'OptimizerAgent',
          optimization_source: 'landing-page-roi',
          predicted_impact: {
            conversion_delta: Math.round(topKw.conversions * 0.1),
            cost_delta_micros: Math.round(topKw.cost_micros * 0.12),
            confidence: 0.6,
            timeframe: 'monthly',
            explanation:
              'Higher bid captures more traffic on a keyword that already converts well and lands on a proven page.',
          },
          risk_tier: 'auto',
        });
      }
    }

    return recs;
  }

  // ==========================================================
  // Data-access helpers
  // ==========================================================

  private async loadCampaign(campaignId: string): Promise<CampaignRef | null> {
    const { data } = await this.supabase
      .from('campaigns')
      .select('id, name, google_campaign_id, budget_amount_micros')
      .eq('id', campaignId)
      .single();
    if (!data || !data.google_campaign_id) return null;
    return data as CampaignRef;
  }

  private async loadAccount(): Promise<CachedAccount | null> {
    if (this.accountCache) return this.accountCache;
    const { data } = await this.supabase
      .from('google_ads_accounts')
      .select('customer_id')
      .eq('is_active', true)
      .single();
    if (!data || !data.customer_id) return null;
    this.accountCache = { customer_id: data.customer_id };
    return this.accountCache;
  }

  /**
   * Roll up keyword-level performance over the last N days. Joins keywords
   * to ad_groups (for google_ad_group_id) and to performance_snapshots
   * filtered on entity_type='keyword'. Quality score uses the latest
   * snapshot value (not an average) since QS is a current measurement,
   * not a cumulative metric.
   */
  private async loadKeywordsWithPerformance(
    campaignId: string,
    lookbackDays: number,
  ): Promise<KeywordRollup[]> {
    const dateFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Step 1: all keywords in this campaign (with their ad group's google ID)
    const { data: keywordRows } = await this.supabase
      .from('keywords')
      .select(
        'id, text, match_type, google_keyword_id, cpc_bid_micros, ad_group_id, ad_group:ad_groups!inner(id, campaign_id, google_ad_group_id)',
      )
      .eq('ad_group.campaign_id', campaignId);
    if (!keywordRows || keywordRows.length === 0) return [];

    type KwRow = {
      id: string;
      text: string;
      match_type: string;
      google_keyword_id: string | null;
      cpc_bid_micros: number | null;
      ad_group_id: string;
      ad_group: { google_ad_group_id: string | null } | Array<{ google_ad_group_id: string | null }>;
    };

    const normalizeAdGroup = (
      ag: KwRow['ad_group'],
    ): string | null => {
      if (Array.isArray(ag)) return ag[0]?.google_ad_group_id ?? null;
      return ag?.google_ad_group_id ?? null;
    };

    // Step 2: all snapshots in the window for those keyword IDs
    const keywordIds = (keywordRows as KwRow[]).map((k) => k.id);
    const { data: snaps } = await this.supabase
      .from('performance_snapshots')
      .select('entity_id, date, clicks, cost_micros, conversions, quality_score')
      .eq('entity_type', 'keyword')
      .in('entity_id', keywordIds)
      .gte('date', dateFrom)
      .order('date', { ascending: true });

    // Roll up
    const priorWeekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const twoWeekCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const agg = new Map<
      string,
      {
        clicks: number;
        cost: number;
        conversions: number;
        qsSamples: Array<{ date: string; qs: number }>;
      }
    >();

    for (const s of (snaps as Array<{
      entity_id: string;
      date: string;
      clicks: number;
      cost_micros: number;
      conversions: number;
      quality_score: number | null;
    }>) || []) {
      const existing = agg.get(s.entity_id) ?? {
        clicks: 0,
        cost: 0,
        conversions: 0,
        qsSamples: [],
      };
      existing.clicks += s.clicks;
      existing.cost += s.cost_micros;
      existing.conversions += s.conversions;
      if (s.quality_score !== null && s.quality_score !== undefined) {
        existing.qsSamples.push({ date: s.date, qs: s.quality_score });
      }
      agg.set(s.entity_id, existing);
    }

    return (keywordRows as KwRow[]).map((k) => {
      const rollup = agg.get(k.id) ?? {
        clicks: 0,
        cost: 0,
        conversions: 0,
        qsSamples: [],
      };
      const latestQs =
        rollup.qsSamples.length > 0
          ? rollup.qsSamples[rollup.qsSamples.length - 1].qs
          : null;
      // Prior-week avg QS: samples in days 14–7 ago
      const priorSamples = rollup.qsSamples.filter(
        (s) => s.date >= twoWeekCutoff && s.date < priorWeekCutoff,
      );
      const priorQs =
        priorSamples.length > 0
          ? priorSamples.reduce((s, x) => s + x.qs, 0) / priorSamples.length
          : null;
      return {
        id: k.id,
        text: k.text,
        match_type: k.match_type,
        google_keyword_id: k.google_keyword_id,
        cpc_bid_micros: k.cpc_bid_micros,
        ad_group_id: k.ad_group_id,
        google_ad_group_id: normalizeAdGroup(k.ad_group),
        clicks: rollup.clicks,
        cost_micros: rollup.cost,
        conversions: rollup.conversions,
        latest_quality_score: latestQs,
        prior_week_quality_score: priorQs,
      };
    });
  }

  /**
   * Daily campaign spend over last N days. Reads from campaign-level
   * performance_snapshots.
   */
  private async loadCampaignDailySpend(
    campaignId: string,
    lookbackDays: number,
  ): Promise<CampaignDailyPoint[]> {
    const dateFrom = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const { data } = await this.supabase
      .from('performance_snapshots')
      .select('date, cost_micros, conversions, clicks')
      .eq('entity_type', 'campaign')
      .eq('entity_id', campaignId)
      .gte('date', dateFrom)
      .order('date', { ascending: true });
    return (data as CampaignDailyPoint[]) ?? [];
  }

  /**
   * Ad groups in this campaign whose ads' final_urls include the given page.
   * `page` can be a full URL or a path; we match on substring to be lenient.
   */
  private async findAdGroupsLinkingTo(
    campaignId: string,
    page: string,
  ): Promise<string[]> {
    const { data: ads } = await this.supabase
      .from('ads')
      .select('ad_group_id, final_urls, ad_group:ad_groups!inner(id, campaign_id)')
      .eq('ad_group.campaign_id', campaignId);
    if (!ads) return [];

    type AdRow = {
      ad_group_id: string;
      final_urls: string[] | null;
    };

    const matchingAdGroups = new Set<string>();
    for (const ad of ads as AdRow[]) {
      const urls = ad.final_urls ?? [];
      if (urls.some((u) => typeof u === 'string' && u.includes(page))) {
        matchingAdGroups.add(ad.ad_group_id);
      }
    }
    return Array.from(matchingAdGroups);
  }

  /**
   * Top-converting keyword in an ad group over the last 30 days.
   */
  private async findTopConvertingKeyword(
    adGroupId: string,
  ): Promise<{
    id: string;
    text: string;
    google_keyword_id: string | null;
    google_ad_group_id: string | null;
    cpc_bid_micros: number | null;
    conversions: number;
    cost_micros: number;
  } | null> {
    const { data: keywordRows } = await this.supabase
      .from('keywords')
      .select(
        'id, text, google_keyword_id, cpc_bid_micros, ad_group:ad_groups!inner(id, google_ad_group_id)',
      )
      .eq('ad_group_id', adGroupId);
    if (!keywordRows || keywordRows.length === 0) return null;

    type KwRow = {
      id: string;
      text: string;
      google_keyword_id: string | null;
      cpc_bid_micros: number | null;
      ad_group: { google_ad_group_id: string | null } | Array<{ google_ad_group_id: string | null }>;
    };

    const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const keywordIds = (keywordRows as KwRow[]).map((k) => k.id);
    const { data: snaps } = await this.supabase
      .from('performance_snapshots')
      .select('entity_id, cost_micros, conversions')
      .eq('entity_type', 'keyword')
      .in('entity_id', keywordIds)
      .gte('date', dateFrom);

    const totals = new Map<string, { conv: number; cost: number }>();
    for (const s of (snaps as Array<{
      entity_id: string;
      cost_micros: number;
      conversions: number;
    }>) || []) {
      const existing = totals.get(s.entity_id) ?? { conv: 0, cost: 0 };
      existing.conv += s.conversions;
      existing.cost += s.cost_micros;
      totals.set(s.entity_id, existing);
    }

    let best: KwRow | null = null;
    let bestConv = 0;
    for (const kw of keywordRows as KwRow[]) {
      const t = totals.get(kw.id);
      if (t && t.conv > bestConv) {
        bestConv = t.conv;
        best = kw;
      }
    }
    if (!best || bestConv === 0) return null;

    const normalizeAdGroup = (
      ag: KwRow['ad_group'],
    ): string | null => {
      if (Array.isArray(ag)) return ag[0]?.google_ad_group_id ?? null;
      return ag?.google_ad_group_id ?? null;
    };

    const totals_best = totals.get(best.id)!;
    return {
      id: best.id,
      text: best.text,
      google_keyword_id: best.google_keyword_id,
      google_ad_group_id: normalizeAdGroup(best.ad_group),
      cpc_bid_micros: best.cpc_bid_micros,
      conversions: totals_best.conv,
      cost_micros: totals_best.cost,
    };
  }
}

// Singleton — mirrors qaSentinel pattern.
export const optimizerAgent = new OptimizerAgent();
