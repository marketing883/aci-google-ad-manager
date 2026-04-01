import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/agents/tools';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { business_description, seed_keywords, competitor_domains } = body;

    if (!business_description) {
      return NextResponse.json({ error: 'business_description is required' }, { status: 400 });
    }

    // Research keywords
    const kwResult = await executeTool('research_keywords', {
      seed_keywords: seed_keywords || [business_description.split(' ').slice(0, 3).join(' ')],
      business_description,
    });

    // Analyze competitors if domains provided
    let compResult = null;
    if (competitor_domains?.length > 0) {
      compResult = await executeTool('analyze_competitors', {
        competitor_domains,
        seed_keywords: seed_keywords || [],
      });
    }

    return NextResponse.json({
      keywords: kwResult.data,
      competitors: compResult?.data || null,
      summary: kwResult.result + (compResult ? '\n' + compResult.result : ''),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Research failed' },
      { status: 500 },
    );
  }
}
