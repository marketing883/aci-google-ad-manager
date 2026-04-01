import { NextRequest, NextResponse } from 'next/server';
import { approvalEngine } from '@/lib/approval-engine';
import { rejectSchema } from '@/schemas/approval';

// POST /api/approvals/[id]/reject
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { reviewer_notes } = rejectSchema.parse(body);

    const result = await approvalEngine.reject(id, reviewer_notes);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reject' },
      { status: 500 },
    );
  }
}
