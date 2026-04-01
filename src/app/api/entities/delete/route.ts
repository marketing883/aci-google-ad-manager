import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// POST /api/entities/delete — Soft delete any entity by type + id
export async function POST(request: NextRequest) {
  try {
    const { entity_type, entity_id } = await request.json();

    if (!entity_type || !entity_id) {
      return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    switch (entity_type) {
      case 'campaign': {
        await supabase.from('campaigns').update({ status: 'removed' }).eq('id', entity_id);
        break;
      }
      case 'ad_group': {
        // Soft delete ad group + its ads + keywords
        await supabase.from('ads').update({ status: 'removed' }).eq('ad_group_id', entity_id);
        await supabase.from('keywords').update({ status: 'removed' }).eq('ad_group_id', entity_id);
        await supabase.from('ad_groups').update({ status: 'removed' }).eq('id', entity_id);
        break;
      }
      case 'ad': {
        await supabase.from('ads').update({ status: 'removed' }).eq('id', entity_id);
        break;
      }
      case 'keyword': {
        await supabase.from('keywords').update({ status: 'removed' }).eq('id', entity_id);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown entity type: ${entity_type}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, entity_type, entity_id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
