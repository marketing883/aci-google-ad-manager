import { NextRequest, NextResponse } from 'next/server';
import { copywriterAgent } from '@/lib/agents/copywriter-agent';
import { qaSentinel } from '@/lib/agents/qa-sentinel';
import { adCopyVariantsSchema } from '@/schemas/agent-output';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      campaign_name, ad_group_theme, business_description,
      target_audience, landing_page_url, persona, keywords,
      campaign_type, url_template, variant_count,
    } = body;

    if (!ad_group_theme || !business_description) {
      return NextResponse.json(
        { error: 'ad_group_theme and business_description are required' },
        { status: 400 },
      );
    }

    // Generate with QA retry loop
    const { output, qaResult, retries } = await qaSentinel.validateAndRetry(
      () => copywriterAgent.generateCopy({
        campaign_name: campaign_name || 'Campaign',
        ad_group_theme,
        business_description,
        target_audience,
        landing_page_url,
        persona,
        keywords,
        campaign_type,
        url_template,
        variant_count,
      }),
      (errors, original) => copywriterAgent.handleQAFeedback(
        errors, original, adCopyVariantsSchema,
      ),
      (output) => qaSentinel.validateAdCopyVariants(output),
    );

    return NextResponse.json({
      copy: output,
      qa: {
        passed: qaResult.passed,
        errors: qaResult.errors,
        warnings: qaResult.warnings,
        retries,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Copy generation failed' },
      { status: 500 },
    );
  }
}
