import { NextRequest, NextResponse } from 'next/server';
import { approvalEngine } from '@/lib/approval-engine';
import { approveSchema } from '@/schemas/approval';

// POST /api/approvals/[id]/approve
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { reviewer_notes } = approveSchema.parse(body);

    const result = await approvalEngine.approve(id, reviewer_notes);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve' },
      { status: 500 },
    );
  }
}
