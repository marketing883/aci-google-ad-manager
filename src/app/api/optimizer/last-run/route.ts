import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * GET /api/optimizer/last-run
 *
 * Returns the most recent OptimizerAgent run summary so the Briefing "Ayn
 * status" card can render "Last run 2h ago · 6 recs, 2 auto-applied".
 *
 * Source: agent_logs row with action='optimizer_run' (written by
 * /api/cron/run-optimizer at end of each run). The structured run summary
 * is stored in metadata JSONB for easy consumption here.
 *
 * Falls back to NULL fields when no optimizer run has happened yet — the
 * UI treats that as "never run" and shows appropriate copy.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('agent_logs')
      .select('created_at, status, metadata, output_summary')
      .eq('agent_name', 'OptimizerAgent')
      .eq('action', 'optimizer_run')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({
        has_run: false,
        last_run_at: null,
        status: null,
        recommendations_generated: 0,
        auto_applied: 0,
        queued_for_review: 0,
        blocked: 0,
        errors: 0,
        campaigns_processed: 0,
      });
    }

    const meta = (data.metadata ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      has_run: true,
      last_run_at: data.created_at,
      status: data.status,
      recommendations_generated:
        (meta.recommendations_generated as number | undefined) ?? 0,
      auto_applied: (meta.auto_applied as number | undefined) ?? 0,
      queued_for_review:
        (meta.queued_for_review as number | undefined) ?? 0,
      blocked: (meta.blocked as number | undefined) ?? 0,
      errors: (meta.errors as number | undefined) ?? 0,
      campaigns_processed:
        (meta.campaigns_processed as number | undefined) ?? 0,
      auto_optimize_enabled:
        (meta.auto_optimize_enabled as boolean | undefined) ?? false,
      auto_apply_risk_tier:
        (meta.auto_apply_risk_tier as string | undefined) ?? 'never',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to load last run',
      },
      { status: 500 },
    );
  }
}
