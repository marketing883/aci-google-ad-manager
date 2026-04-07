import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/agents/tools';

// POST /api/analytics — Proxy for get_analytics_intelligence tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await executeTool('get_analytics_intelligence', body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analytics failed' },
      { status: 500 },
    );
  }
}
