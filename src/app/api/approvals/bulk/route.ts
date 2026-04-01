import { NextRequest, NextResponse } from 'next/server';
import { approvalEngine } from '@/lib/approval-engine';
import { bulkApprovalSchema } from '@/schemas/approval';

// POST /api/approvals/bulk — Bulk approve/reject
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, action, reviewer_notes } = bulkApprovalSchema.parse(body);

    const result = await approvalEngine.bulkAction(ids, action, reviewer_notes);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk action failed' },
      { status: 500 },
    );
  }
}
