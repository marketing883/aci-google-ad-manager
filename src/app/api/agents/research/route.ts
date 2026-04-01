import { NextRequest, NextResponse } from 'next/server';
import { researchAgent } from '@/lib/agents/research-agent';
import { qaSentinel } from '@/lib/agents/qa-sentinel';
import { createAdminClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_description, seed_keywords, competitor_domains, target_audience } = body;

    if (!business_description) {
      return NextResponse.json({ error: 'business_description is required' }, { status: 400 });
    }

    // Run research
    const result = await researchAgent.research({
      business_description,
      seed_keywords: seed_keywords || [],
      competitor_domains: competitor_domains || [],
      target_audience,
    });

    // QA validate
    const qaResult = await qaSentinel.validateResearchOutput(result);

    // Cache results
    const supabase = createAdminClient();
    await supabase.from('keyword_research').insert({
      query: business_description,
      results: result as unknown as Record<string, unknown>,
      source: 'research_agent',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return NextResponse.json({
      research: result,
      qa: {
        passed: qaResult.passed,
        errors: qaResult.errors,
        warnings: qaResult.warnings,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Research failed' },
      { status: 500 },
    );
  }
}
