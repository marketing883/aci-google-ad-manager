import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { approvalEngine } from '@/lib/approval-engine';
import { qaSentinel } from '@/lib/agents/qa-sentinel';

// POST /api/campaigns/[id]/submit — Validate + submit campaign for approval
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check env vars
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({
        error: 'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
        has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      }, { status: 500 });
    }

    const supabase = createAdminClient();

    // Fetch campaign
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Fetch ad groups + ads + keywords for validation
    const { data: adGroups } = await supabase.from('ad_groups').select('*').eq('campaign_id', id).neq('status', 'removed');
    const agIds = (adGroups || []).map((ag: { id: string }) => ag.id);

    let ads: Array<{ ad_group_id: string; headlines: Array<{ text: string }>; descriptions: Array<{ text: string }>; final_urls: string[] }> = [];
    let keywords: Array<{ ad_group_id: string; text: string; match_type: string }> = [];

    if (agIds.length > 0) {
      const [adsRes, kwRes] = await Promise.all([
        supabase.from('ads').select('*').in('ad_group_id', agIds).neq('status', 'removed'),
        supabase.from('keywords').select('*').in('ad_group_id', agIds).neq('status', 'removed'),
      ]);
      ads = adsRes.data || [];
      keywords = kwRes.data || [];
    }

    // Run QA validation
    const blueprint = {
      campaign: {
        name: campaign.name,
        campaign_type: campaign.campaign_type,
        budget_amount_micros: campaign.budget_amount_micros,
        bidding_strategy: campaign.bidding_strategy,
        geo_targets: campaign.geo_targets || [],
        language_targets: campaign.language_targets || [],
        network_settings: campaign.network_settings || { search: true, display: false, partners: false },
      },
      ad_groups: (adGroups || []).map((ag: { id: string; name: string }) => ({
        name: ag.name,
        ads: ads.filter((a) => a.ad_group_id === ag.id).map((a) => ({
          headlines: a.headlines,
          descriptions: a.descriptions,
          final_urls: a.final_urls,
        })),
        keywords: keywords.filter((k) => k.ad_group_id === ag.id).map((k) => ({
          text: k.text,
          match_type: k.match_type,
        })),
      })),
      reasoning: '',
    };

    const qaResult = await qaSentinel.validateCampaignBlueprint(blueprint as any);

    // Submit to approval queue
    const approval = await approvalEngine.enqueue({
      action_type: 'push_to_google_ads',
      entity_type: 'campaign',
      entity_id: id,
      payload: {
        campaign_id: id,
        campaign_name: campaign.name,
        campaign_type: campaign.campaign_type,
        budget: campaign.budget_amount_micros,
        ad_groups_count: (adGroups || []).length,
        ads_count: ads.length,
        keywords_count: keywords.length,
      },
      ai_reasoning: `Campaign "${campaign.name}" submitted for push to Google Ads. QA: ${qaResult.passed ? 'PASSED' : `FAILED (${qaResult.errors.length} errors)`}`,
      confidence_score: qaResult.passed ? 1.0 : 0.5,
      priority: qaResult.passed ? 'normal' : 'high',
      agent_name: 'Manual',
    });

    return NextResponse.json({
      success: true,
      approval_id: approval.id,
      qa: {
        passed: qaResult.passed,
        errors: qaResult.errors,
        warnings: qaResult.warnings,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Submit failed' },
      { status: 500 },
    );
  }
}
