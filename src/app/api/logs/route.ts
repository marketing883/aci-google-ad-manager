import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/**
 * GET /api/logs
 *
 * Agent activity log. Supports filtering by:
 *   - ?agent=OptimizerAgent  — filter by agent name (or "all")
 *   - ?entity_type=campaign  — filter by entity type (campaign, ad_group, etc)
 *   - ?entity_id=<uuid>      — filter to a specific entity's history
 *   - ?status=success|error  — filter by outcome
 *   - ?limit=100             — max rows to return
 *
 * Added in migration 009: rows now include entity_type, entity_id, and
 * entity_name so the UI can render per-entity activity timelines.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const agent = params.get('agent');
    const entityType = params.get('entity_type');
    const entityId = params.get('entity_id');
    const status = params.get('status');
    const limit = Math.min(parseInt(params.get('limit') || '100'), 500);

    let query = supabase
      .from('agent_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (agent && agent !== 'all') {
      query = query.eq('agent_name', agent);
    }
    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (entityId) {
      query = query.eq('entity_id', entityId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch logs' },
      { status: 500 },
    );
  }
}
