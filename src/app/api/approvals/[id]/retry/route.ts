import { NextRequest, NextResponse } from 'next/server';
import { approvalEngine } from '@/lib/approval-engine';

// POST /api/approvals/[id]/retry — Retry a failed approval
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await approvalEngine.retry(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Retry failed' },
      { status: 500 },
    );
  }
}
