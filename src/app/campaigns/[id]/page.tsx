'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Pause, Play, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

interface CampaignDetail {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_amount_micros: number;
  bidding_strategy: string;
  target_cpa_micros: number | null;
  geo_targets: Array<{ country?: string; region?: string; city?: string }>;
  language_targets: string[];
  ad_groups: Array<{
    id: string;
    name: string;
    status: string;
    cpc_bid_micros: number | null;
    ads: Array<{ id: string; headlines: Array<{ text: string }>; descriptions: Array<{ text: string }>; status: string }>;
    keywords: Array<{ id: string; text: string; match_type: string; status: string; quality_score: number | null }>;
  }>;
  performance: Array<{ date: string; impressions: number; clicks: number; cost_micros: number; conversions: number }>;
  created_at: string;
}

function formatMicros(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { fetchCampaign(); }, [id]);

  async function fetchCampaign() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCampaign(data);
      // Auto-expand all ad groups
      if (data.ad_groups) {
        setExpandedGroups(new Set(data.ad_groups.map((ag: { id: string }) => ag.id)));
      }
    } catch { setCampaign(null); }
    setLoading(false);
  }

  async function toggleStatus() {
    if (!campaign) return;
    setActionLoading(true);
    const newStatus = campaign.status === 'active' ? 'paused' : 'active';
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchCampaign();
    } catch { /* ignore */ }
    setActionLoading(false);
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  if (loading) return <div className="text-gray-500 text-center py-12">Loading campaign...</div>;
  if (!campaign) return <div className="text-red-400 text-center py-12">Campaign not found</div>;

  const totalClicks = campaign.performance.reduce((s, p) => s + p.clicks, 0);
  const totalSpend = campaign.performance.reduce((s, p) => s + p.cost_micros, 0);
  const totalConv = campaign.performance.reduce((s, p) => s + p.conversions, 0);
  const totalImpr = campaign.performance.reduce((s, p) => s + p.impressions, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/campaigns" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <p className="text-sm text-gray-500">{campaign.campaign_type} &bull; Created {new Date(campaign.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleStatus} disabled={actionLoading} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : campaign.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {campaign.status === 'active' ? 'Pause' : 'Activate'}
          </button>
          <Link href={`/campaigns/${id}/edit`} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            <Pencil className="w-4 h-4" /> Edit
          </Link>
        </div>
      </div>

      {/* Stats + Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Impressions', value: totalImpr.toLocaleString() },
              { label: 'Clicks', value: totalClicks.toLocaleString() },
              { label: 'Spend', value: formatMicros(totalSpend) },
              { label: 'Conversions', value: totalConv.toFixed(1) },
            ].map((s) => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className="text-lg font-bold">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Performance mini chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-3 text-gray-400">Daily Spend (30 days)</h2>
            {campaign.performance.length > 0 ? (
              <div className="h-32 flex items-end gap-0.5">
                {campaign.performance.map((day) => {
                  const max = Math.max(...campaign.performance.map((d) => d.cost_micros)) || 1;
                  return (
                    <div key={day.date} className="flex-1" title={`${day.date}: ${formatMicros(day.cost_micros)}`}>
                      <div className="w-full bg-blue-500 rounded-t" style={{ height: `${Math.max((day.cost_micros / max) * 100, 2)}%` }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-600 text-sm text-center py-8">No performance data yet</p>
            )}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${campaign.status === 'active' ? 'bg-green-600' : campaign.status === 'paused' ? 'bg-yellow-600' : 'bg-gray-600'} text-white`}>{campaign.status}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Type</span><span>{campaign.campaign_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Budget</span><span>{formatMicros(campaign.budget_amount_micros)}/day</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Bidding</span><span className="text-xs">{campaign.bidding_strategy.replace(/_/g, ' ')}</span></div>
            {campaign.target_cpa_micros && <div className="flex justify-between"><span className="text-gray-400">Target CPA</span><span>{formatMicros(campaign.target_cpa_micros)}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Locations</span><span className="text-xs">{campaign.geo_targets.map((g) => g.country || g.region || g.city).join(', ') || 'All'}</span></div>
          </div>
        </div>
      </div>

      {/* Ad Groups */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Ad Groups ({campaign.ad_groups.length})</h2>
        </div>
        {campaign.ad_groups.length > 0 ? (
          <div className="space-y-3">
            {campaign.ad_groups.map((ag) => (
              <div key={ag.id} className="border border-gray-800 rounded-lg">
                <button onClick={() => toggleGroup(ag.id)} className="w-full flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-2">
                    {expandedGroups.has(ag.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="font-medium">{ag.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${ag.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>{ag.status}</span>
                  </div>
                  <span className="text-xs text-gray-500">{ag.ads.length} ads &bull; {ag.keywords.length} keywords</span>
                </button>
                {expandedGroups.has(ag.id) && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Ads */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Ads</h4>
                      {ag.ads.map((ad) => (
                        <div key={ad.id} className="p-2 bg-gray-800 rounded mb-1 text-xs">
                          <p className="text-blue-300">{ad.headlines.map((h) => h.text).join(' | ')}</p>
                          <p className="text-gray-400 mt-0.5">{ad.descriptions.map((d) => d.text).join(' ')}</p>
                        </div>
                      ))}
                      {ag.ads.length === 0 && <p className="text-gray-600 text-xs">No ads</p>}
                    </div>
                    {/* Keywords */}
                    <div>
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Keywords</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {ag.keywords.map((kw) => (
                          <span key={kw.id} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-300">
                            {kw.match_type === 'EXACT' ? `[${kw.text}]` : kw.match_type === 'PHRASE' ? `"${kw.text}"` : kw.text}
                            {kw.quality_score && <span className="ml-1 text-gray-500">QS:{kw.quality_score}</span>}
                          </span>
                        ))}
                        {ag.keywords.length === 0 && <p className="text-gray-600 text-xs">No keywords</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-sm py-8 text-center">No ad groups yet.</p>
        )}
      </div>
    </div>
  );
}
