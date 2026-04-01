import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/agents/tools';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, campaign_type, daily_budget_dollars, bidding_strategy, geo_targets, language_targets } = body;

    if (!name) {
      return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    }

    const result = await executeTool('create_campaign', {
      name,
      campaign_type: campaign_type || 'SEARCH',
      daily_budget_dollars: daily_budget_dollars || 50,
      bidding_strategy: bidding_strategy || 'MAXIMIZE_CLICKS',
      geo_targets: geo_targets || ['United States'],
      language_targets: language_targets || ['en'],
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Campaign creation failed' },
      { status: 500 },
    );
  }
}
