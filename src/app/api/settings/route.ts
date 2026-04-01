import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('settings').select('*');

    if (error) throw error;

    // Convert array of {key, value} to object
    const settings = Object.fromEntries(
      (data || []).map((row: { key: string; value: unknown }) => [row.key, row.value]),
    );

    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load settings' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const updates = await request.json();
    const supabase = createAdminClient();

    for (const [key, value] of Object.entries(updates)) {
      const { error } = await supabase
        .from('settings')
        .upsert({ key, value }, { onConflict: 'key' });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update settings' },
      { status: 500 },
    );
  }
}
