import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/agents/tools';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ad_group_id, headlines, descriptions, final_urls, path1, path2 } = body;

    if (!ad_group_id || !headlines || !descriptions || !final_urls) {
      return NextResponse.json(
        { error: 'ad_group_id, headlines, descriptions, and final_urls are required' },
        { status: 400 },
      );
    }

    const result = await executeTool('create_ad', {
      ad_group_id,
      headlines,
      descriptions,
      final_urls,
      path1,
      path2,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ad creation failed' },
      { status: 500 },
    );
  }
}
