import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

// GET /api/chat/history — Load chat history
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load history' },
      { status: 500 },
    );
  }
}

// DELETE /api/chat/history — Clear chat history
export async function DELETE() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear history' },
      { status: 500 },
    );
  }
}
