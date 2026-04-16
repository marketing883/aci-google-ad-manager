import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { createLogger } from '@/lib/utils/logger';
import { optimizerAgent } from '@/lib/agents/optimizer-agent';
import { qaSentinel } from '@/lib/agents/qa-sentinel';
import type { Recommendation } from '@/schemas/approval';

const logger = createLogger('RunOptimizerCron');

// ============================================================
// POST /api/cron/run-optimizer
//
// The heartbeat of the automation loop. Runs every 2 hours per vercel.json
// cron config. For each active campaign, runs OptimizerAgent, validates
// every recommendation through QASentinel, then writes approvals to the
// queue.
//
// Auto-apply is controlled by two settings:
//   - auto_optimize_enabled (default false) — master switch
//   - auto_apply_risk_tier   (default 'never') — which tiers auto-apply
//                              values: 'never' | 'auto' | 'auto-and-review'
//
// Defaulting to opt-in-only. Users explicitly flip the switch in Settings
// before Ayn starts applying changes without review.
// ============================================================

type AutoApplyTier = 'never' | 'auto' | 'auto-and-review';

async function getAutomationSettings(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<{ enabled: boolean; tier: AutoApplyTier }> {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['auto_optimize_enabled', 'auto_apply_risk_tier']);

  const map = new Map<string, unknown>(
    (data || []).map((r: { key: string; value: unknown }) => [r.key, r.value]),
  );
  // Settings values come back as JSON — coerce defensively.
  const parseBool = (v: unknown): boolean => v === true || v === 'true';
  const parseTier = (v: unknown): AutoApplyTier => {
    if (v === 'auto' || v === 'auto-and-review') return v;
    return 'never';
  };

  return {
    enabled: parseBool(map.get('auto_optimize_enabled')),
    tier: parseTier(map.get('auto_apply_risk_tier')),
  };
}

export async function POST(request: NextRequest) {
  // Cron secret guard — matches other cron routes in this codebase
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const startedAt = new Date();

    // Load active campaigns that are actually pushed to Google Ads. Drafts
    // and never-pushed campaigns have nothing for the optimizer to do.
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, name, google_campaign_id')
      .eq('status', 'active')
      .not('google_campaign_id', 'is', null);

    if (!campaigns || campaigns.length === 0) {
      logger.info('No active campaigns to optimize');
      return NextResponse.json({
        success: true,
        recommendations_generated: 0,
        auto_applied: 0,
        queued_for_review: 0,
        blocked: 0,
        errors: 0,
        ran_at: startedAt.toISOString(),
        message: 'No active campaigns',
      });
    }

    const { enabled: autoEnabled, tier: autoTier } =
      await getAutomationSettings(supabase);

    let generated = 0;
    let autoApplied = 0;
    let queuedForReview = 0;
    let blocked = 0;
    let errors = 0;

    for (const campaign of campaigns as Array<{
      id: string;
      name: string;
      google_campaign_id: string;
    }>) {
      let recs: Recommendation[] = [];
      try {
        recs = await optimizerAgent.optimize(campaign.id);
      } catch (e) {
        errors++;
        logger.error(`OptimizerAgent failed for ${campaign.name}`, {
          error: (e as Error).message,
        });
        continue;
      }

      for (const rec of recs) {
        generated++;

        // QA gate — may downgrade risk_tier, may reject outright.
        const qa = await qaSentinel.validateRecommendation(rec);
        if (!qa.passed) {
          blocked++;
          logger.info(
            `Blocked rec from ${rec.optimization_source} on ${rec.entity_name}`,
            { errors: qa.errors.length },
          );
          continue;
        }

        // QA may have tightened the tier — respect the stricter of the two.
        const finalTier = qa.riskTier;

        // Decide initial status:
        //   - auto-apply eligible: when setting is enabled AND the agreed
        //     tier permits THIS rec's tier to auto-apply.
        const shouldAutoApprove =
          autoEnabled &&
          ((autoTier === 'auto' && finalTier === 'auto') ||
            (autoTier === 'auto-and-review' &&
              (finalTier === 'auto' || finalTier === 'review')));

        const initialStatus = shouldAutoApprove ? 'approved' : 'pending';

        const { data: inserted, error: insertError } = await supabase
          .from('approval_queue')
          .insert({
            action_type: rec.action_type,
            entity_type: rec.entity_type,
            entity_id: rec.entity_id,
            payload: rec.payload,
            previous_state: rec.previous_state ?? null,
            status: initialStatus,
            ai_reasoning: rec.ai_reasoning,
            confidence_score: rec.confidence_score,
            priority: rec.priority,
            agent_name: rec.agent_name,
            predicted_impact: rec.predicted_impact,
            optimization_source: rec.optimization_source,
            // Stamp reviewed_at for auto-approvals so the activity timeline
            // reads coherently. Reviewer attribution is enforced in Phase 5.
            reviewed_at: shouldAutoApprove ? new Date().toISOString() : null,
            reviewer_notes: shouldAutoApprove
              ? 'Auto-approved by OptimizerAgent (risk tier: ' + finalTier + ')'
              : null,
          })
          .select('id')
          .single();

        if (insertError || !inserted) {
          errors++;
          logger.error(`Failed to insert approval for ${rec.entity_name}`, {
            error: insertError?.message,
          });
          continue;
        }

        // If auto-approved, kick off the apply path via the existing
        // ApprovalEngine. Dynamic import to avoid pulling the engine into
        // cron bundles when auto-apply is off.
        if (shouldAutoApprove) {
          try {
            const { ApprovalEngine } = await import('@/lib/approval-engine');
            const engine = new ApprovalEngine();
            await engine.apply(inserted.id);
            autoApplied++;
          } catch (e) {
            errors++;
            logger.error(
              `Auto-apply failed for ${inserted.id} (${rec.entity_name})`,
              { error: (e as Error).message },
            );
            // ApprovalEngine.apply() has already written status='failed' on error.
          }
        } else {
          queuedForReview++;
        }
      }
    }

    const summary = {
      success: true,
      ran_at: startedAt.toISOString(),
      campaigns_processed: campaigns.length,
      recommendations_generated: generated,
      auto_applied: autoApplied,
      queued_for_review: queuedForReview,
      blocked,
      errors,
      auto_optimize_enabled: autoEnabled,
      auto_apply_risk_tier: autoTier,
    };

    logger.info('Optimizer run complete', summary);

    // Audit-log the run itself so the Ops dashboard (Phase 5) and the
    // Briefing Ayn-status card (Phase 1.G) can show "last run: N mins ago,
    // produced X recommendations" without inferring from approval_queue.
    // The full summary lives in metadata JSONB for structured reads.
    await supabase.from('agent_logs').insert({
      agent_name: 'OptimizerAgent',
      action: 'optimizer_run',
      input_summary: `${campaigns.length} active campaigns`,
      output_summary: `Generated ${generated}, auto ${autoApplied}, queued ${queuedForReview}, blocked ${blocked}, errors ${errors}`,
      status: errors > 0 && generated === 0 ? 'error' : 'success',
      duration_ms: Date.now() - startedAt.getTime(),
      metadata: summary,
    });

    return NextResponse.json(summary);
  } catch (error) {
    logger.error('Optimizer cron top-level error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Optimizer failed' },
      { status: 500 },
    );
  }
}
