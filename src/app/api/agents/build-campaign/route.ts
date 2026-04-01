import { NextRequest, NextResponse } from 'next/server';
import { campaignBuilderAgent } from '@/lib/agents/campaign-builder-agent';
import { qaSentinel } from '@/lib/agents/qa-sentinel';
import { campaignBlueprintSchema } from '@/schemas/agent-output';
import { approvalEngine } from '@/lib/approval-engine';
import { createAdminClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      research, instructions, business_description, google_ads_account_id,
      target_audience, budget_daily_dollars, campaign_type, landing_page_url,
      geo_targets, language_targets,
    } = body;

    if (!research || !business_description) {
      return NextResponse.json(
        { error: 'research and business_description are required' },
        { status: 400 },
      );
    }

    // Build with QA retry loop
    const { output, qaResult, retries } = await qaSentinel.validateAndRetry(
      () => campaignBuilderAgent.buildCampaign({
        research,
        instructions: instructions || business_description,
        business_description,
        target_audience,
        budget_daily_dollars,
        campaign_type,
        landing_page_url,
        geo_targets,
        language_targets,
      }),
      (errors, original) => campaignBuilderAgent.handleQAFeedback(
        errors, original, campaignBlueprintSchema,
      ),
      (output) => qaSentinel.validateCampaignBlueprint(output),
    );

    // Create approval queue entry
    const approval = await approvalEngine.enqueue({
      action_type: 'create_campaign',
      entity_type: 'campaign',
      payload: output as unknown as Record<string, unknown>,
      ai_reasoning: output.reasoning,
      confidence_score: qaResult.passed ? 0.9 : 0.6,
      priority: 'normal',
      agent_name: 'CampaignBuilderAgent',
    });

    return NextResponse.json({
      blueprint: output,
      approval_id: approval.id,
      qa: {
        passed: qaResult.passed,
        errors: qaResult.errors,
        warnings: qaResult.warnings,
        retries,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Campaign build failed' },
      { status: 500 },
    );
  }
}
