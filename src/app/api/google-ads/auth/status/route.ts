import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('google_ads_accounts')
      .select('id, customer_id, account_name, is_active, last_synced_at, token_expires_at')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ connected: false });
    }

    const isExpired = data.token_expires_at && new Date(data.token_expires_at) < new Date();

    return NextResponse.json({
      connected: true,
      account: {
        id: data.id,
        customer_id: data.customer_id,
        account_name: data.account_name,
        last_synced_at: data.last_synced_at,
        token_expired: isExpired,
      },
    });
  } catch (error) {
    return NextResponse.json({ connected: false, error: 'Failed to check status' });
  }
}
