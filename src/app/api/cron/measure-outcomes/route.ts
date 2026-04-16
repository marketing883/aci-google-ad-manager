import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('MeasureOutcomesCron');

// ============================================================
// POST /api/cron/measure-outcomes
//
// Runs daily. Closes the feedback loop on applied approvals by comparing
// post-apply performance against the predicted_impact baseline.
//
// Selection: approvals with status='applied', applied_at ≥ 14 days ago,
// and outcome_measured_at IS NULL. 14 days is the signal-stabilization
// window — any shorter and daily noise drowns the trend; any longer and
// the feedback loop gets too slow for the agent to learn from.
//
// For each candidate:
//   1. Identify the entity the change affected (keyword, campaign, etc.)
//   2. Pull 14 days of post-apply performance_snapshots
//   3. Pull the 14 days BEFORE the apply as a baseline (same window length
//      for a like-for-like comparison)
//   4. Compute deltas on the metrics the predicted_impact cared about
//   5. Write the measured delta + accuracy back to approval_queue.actual_impact
//
// Accuracy is computed only on the primary metric for the recommendation's
// source — e.g. bid-efficiency predictions are scored on cpa_delta_micros
// if present, else cost_delta_micros. This tracked hit-rate is what the
// OptimizerAgent will use in Phase 2 to self-calibrate thresholds.
// ============================================================

// Primary metric per source — what "accuracy" is scored against.
const PRIMARY_METRIC: Record<string, keyof PredictedImpactFields> = {
  'bid-efficiency': 'cpa_delta_micros',
  'budget-pacing': 'cost_delta_micros',
  'quality-score-decay': 'cost_delta_micros',
  'landing-page-roi': 'conversion_delta',
  // Phase 2 sources
  'search-terms-harvest': 'cost_delta_micros',
  'competitor-auction': 'conversion_delta',
  'dayparting': 'cpa_delta_micros',
  'attribution-rebalance': 'conversion_delta',
};

interface PredictedImpactFields {
  revenue_delta_micros?: number;
  conversion_delta?: number;
  cost_delta_micros?: number;
  cpa_delta_micros?: number;
  roas_delta?: number;
  confidence?: number;
  timeframe?: 'daily' | 'weekly' | 'monthly';
  explanation?: string;
}

interface AppliedApproval {
  id: string;
  entity_type: string;
  entity_id: string | null;
  applied_at: string;
  optimization_source: string | null;
  predicted_impact: PredictedImpactFields | null;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const startedAt = new Date();

    // Candidates: applied, measurable, and at least 14 days post-apply
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates } = await supabase
      .from('approval_queue')
      .select(
        'id, entity_type, entity_id, applied_at, optimization_source, predicted_impact',
      )
      .eq('status', 'applied')
      .lte('applied_at', cutoff)
      .is('outcome_measured_at', null)
      .not('entity_id', 'is', null)
      .limit(100); // Cap per-run so one long-running cron doesn't DOS the DB

    if (!candidates || candidates.length === 0) {
      logger.info('No applied approvals ready for outcome measurement');
      return NextResponse.json({
        success: true,
        measured: 0,
        ran_at: startedAt.toISOString(),
      });
    }

    let measured = 0;
    let errors = 0;

    for (const approval of candidates as AppliedApproval[]) {
      try {
        if (!approval.entity_id || !approval.applied_at) continue;

        const appliedAt = new Date(approval.applied_at);
        const windowDays = 14;

        // Post-apply window: applied_at → applied_at + 14 days
        const postStart = approval.applied_at.split('T')[0];
        const postEnd = new Date(
          appliedAt.getTime() + windowDays * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split('T')[0];

        // Pre-apply window (same length): applied_at - 14 days → applied_at
        const preStart = new Date(
          appliedAt.getTime() - windowDays * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split('T')[0];
        const preEnd = postStart;

        const entityType = approval.entity_type as
          | 'campaign'
          | 'ad_group'
          | 'ad'
          | 'keyword';

        // Fetch both windows in parallel
        const [preRes, postRes] = await Promise.all([
          supabase
            .from('performance_snapshots')
            .select('cost_micros, conversions, clicks, impressions')
            .eq('entity_type', entityType)
            .eq('entity_id', approval.entity_id)
            .gte('date', preStart)
            .lt('date', preEnd),
          supabase
            .from('performance_snapshots')
            .select('cost_micros, conversions, clicks, impressions')
            .eq('entity_type', entityType)
            .eq('entity_id', approval.entity_id)
            .gte('date', postStart)
            .lte('date', postEnd),
        ]);

        const pre = preRes.data ?? [];
        const post = postRes.data ?? [];

        if (pre.length === 0 || post.length === 0) {
          // Not enough data on one side — mark as measured with a note so we
          // don't keep re-querying the same row.
          await supabase
            .from('approval_queue')
            .update({
              outcome_measured_at: new Date().toISOString(),
              actual_impact: {
                measurement_window_days: windowDays,
                baseline_source: 'prev_14d_vs_post_14d',
                explanation:
                  'Insufficient snapshots on one or both sides of the apply window — outcome not measurable. This is common for very new entities or paused post-apply.',
              },
            })
            .eq('id', approval.id);
          measured++;
          continue;
        }

        // Aggregate both windows
        const sumCost = (rows: Array<{ cost_micros: number }>) =>
          rows.reduce((s, r) => s + (r.cost_micros || 0), 0);
        const sumConv = (rows: Array<{ conversions: number }>) =>
          rows.reduce((s, r) => s + (r.conversions || 0), 0);
        const sumClicks = (rows: Array<{ clicks: number }>) =>
          rows.reduce((s, r) => s + (r.clicks || 0), 0);

        const preCost = sumCost(pre as Array<{ cost_micros: number }>);
        const postCost = sumCost(post as Array<{ cost_micros: number }>);
        const preConv = sumConv(pre as Array<{ conversions: number }>);
        const postConv = sumConv(post as Array<{ conversions: number }>);
        const preClicks = sumClicks(pre as Array<{ clicks: number }>);
        const postClicks = sumClicks(post as Array<{ clicks: number }>);

        const costDelta = postCost - preCost;
        const convDelta = postConv - preConv;
        const clicksDelta = postClicks - preClicks;
        const preCpa = preConv > 0 ? preCost / preConv : null;
        const postCpa = postConv > 0 ? postCost / postConv : null;
        const cpaDelta =
          preCpa !== null && postCpa !== null ? postCpa - preCpa : null;

        // Accuracy: compare actual to predicted on the source's primary metric.
        // Formula: 1 - |actual - predicted| / |predicted|, clamped to [0, 1].
        // Returns null when we can't compare (no prediction or zero baseline).
        let accuracy: number | null = null;
        const source = approval.optimization_source;
        if (source && PRIMARY_METRIC[source] && approval.predicted_impact) {
          const metricKey = PRIMARY_METRIC[source];
          const predicted = approval.predicted_impact[metricKey] as
            | number
            | undefined;
          let actual: number | null = null;
          switch (metricKey) {
            case 'cpa_delta_micros':
              actual = cpaDelta;
              break;
            case 'cost_delta_micros':
              actual = costDelta;
              break;
            case 'conversion_delta':
              actual = convDelta;
              break;
            default:
              actual = null;
          }
          if (
            predicted !== undefined &&
            predicted !== 0 &&
            actual !== null
          ) {
            const relError = Math.abs(actual - predicted) / Math.abs(predicted);
            accuracy = Math.max(0, Math.min(1, 1 - relError));
          }
        }

        const actualImpact: PredictedImpactFields & {
          measurement_window_days: number;
          baseline_source: string;
          accuracy?: number;
        } = {
          cost_delta_micros: Math.round(costDelta),
          conversion_delta: convDelta,
          cpa_delta_micros:
            cpaDelta !== null ? Math.round(cpaDelta) : undefined,
          timeframe: 'monthly', // 14d window scaled monthly is common practice
          measurement_window_days: windowDays,
          baseline_source: 'prev_14d_vs_post_14d',
          explanation: `Pre: ${preClicks} clicks, ${preConv.toFixed(1)} conv, $${(preCost / 1_000_000).toFixed(2)} spend. Post: ${postClicks} clicks, ${postConv.toFixed(1)} conv, $${(postCost / 1_000_000).toFixed(2)} spend. Delta: ${clicksDelta >= 0 ? '+' : ''}${clicksDelta} clicks, ${convDelta >= 0 ? '+' : ''}${convDelta.toFixed(1)} conv, ${costDelta >= 0 ? '+$' : '-$'}${(Math.abs(costDelta) / 1_000_000).toFixed(2)} spend.`,
          ...(accuracy !== null ? { accuracy } : {}),
        };

        await supabase
          .from('approval_queue')
          .update({
            outcome_measured_at: new Date().toISOString(),
            actual_impact: actualImpact,
          })
          .eq('id', approval.id);

        // Log the accuracy score for self-calibration in Phase 2.
        await supabase.from('agent_logs').insert({
          agent_name: 'OptimizerAgent',
          action: 'outcome_measured',
          entity_type: approval.entity_type,
          entity_id: approval.entity_id,
          input_summary: `source=${source ?? 'unknown'}, applied=${approval.applied_at}`,
          output_summary:
            accuracy !== null
              ? `accuracy=${(accuracy * 100).toFixed(0)}%, cpa_delta=${cpaDelta}, cost_delta=${costDelta}, conv_delta=${convDelta}`
              : `measured but no accuracy score (no primary-metric prediction)`,
          status: 'success',
        });

        measured++;
      } catch (e) {
        errors++;
        logger.error(`Failed to measure outcome for approval ${approval.id}`, {
          error: (e as Error).message,
        });
      }
    }

    const summary = {
      success: true,
      ran_at: startedAt.toISOString(),
      candidates: candidates.length,
      measured,
      errors,
    };
    logger.info('measure-outcomes complete', summary);
    return NextResponse.json(summary);
  } catch (error) {
    logger.error('measure-outcomes top-level error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'measure-outcomes failed',
      },
      { status: 500 },
    );
  }
}
