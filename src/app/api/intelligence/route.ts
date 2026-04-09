import { NextResponse } from 'next/server';
import { generateIntelligenceFeed } from '@/lib/intelligence-feed';

// GET /api/intelligence/feed
export async function GET() {
  try {
    const feed = await generateIntelligenceFeed();
    return NextResponse.json(feed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate feed' },
      { status: 500 },
    );
  }
}
