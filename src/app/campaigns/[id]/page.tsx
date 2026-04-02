'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Pause, Play, Trash2, Loader2, ChevronDown, ChevronRight, Plus, X, BarChart3, Settings2, Layers, Send, CheckCircle } from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface CampaignDetail {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  google_campaign_id: string | null;
  budget_amount_micros: number;
  budget_type: string;
  bidding_strategy: string;
  target_cpa_micros: number | null;
  target_roas: number | null;
  geo_targets: Array<{ country?: string; region?: string; city?: string }>;
  language_targets: string[];
  network_settings: { search: boolean; display: boolean; partners: boolean };
  ad_groups: AdGroupDetail[];
  negative_keywords: Array<{ id: string; text: string; match_type: string }>;
  performance: Array<{ date: string; impressions: number; clicks: number; cost_micros: number; conversions: number }>;
  created_at: string;
}

interface AdGroupDetail {
  id: string;
  name: string;
  status: string;
  cpc_bid_micros: number | null;
  ads: Array<{
    id: string;
    headlines: Array<{ text: string; pinned_position?: number }>;
    descriptions: Array<{ text: string }>;
    final_urls: string[];
    path1?: string;
    path2?: string;
    status: string;
  }>;
  keywords: Array<{ id: string; text: string; match_type: string; status: string; quality_score: number | null; cpc_bid_micros: number | null }>;
  negative_keywords: Array<{ id: string; text: string; match_type: string }>;
}

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ============================================================
// Confirm Dialog
// ============================================================

function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Google Ads Preview Card
// ============================================================

function AdPreviewCard({ ad, onDelete }: {
  ad: AdGroupDetail['ads'][0];
  onDelete: (id: string) => void;
}) {
  const [previewIndex, setPreviewIndex] = useState(0);

  // Google RSA shows max 3 headlines and 2 descriptions at a time
  // Generate different combinations to preview
  const headlines = ad.headlines || [];
  const descriptions = ad.descriptions || [];
  const totalCombinations = Math.max(1, Math.ceil(headlines.length / 3));

  const currentHeadlines = headlines.slice(previewIndex * 3, previewIndex * 3 + 3);
  const currentDescs = descriptions.slice(
    Math.min(previewIndex * 2, Math.max(0, descriptions.length - 2)),
    Math.min(previewIndex * 2 + 2, descriptions.length)
  );

  // If current slice is empty, wrap around
  const showHeadlines = currentHeadlines.length > 0 ? currentHeadlines : headlines.slice(0, 3);
  const showDescs = currentDescs.length > 0 ? currentDescs : descriptions.slice(0, 2);

  let displayUrl = 'example.com';
  try {
    if (ad.final_urls?.[0]) {
      displayUrl = new URL(ad.final_urls[0]).hostname + (ad.path1 ? `/${ad.path1}` : '') + (ad.path2 ? `/${ad.path2}` : '');
    }
  } catch { /* invalid URL */ }

  return (
    <div className="bg-white rounded-lg p-4 relative group">
      {/* Delete button */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
        <button onClick={() => onDelete(ad.id)} className="p-1 bg-red-100 hover:bg-red-200 rounded text-red-600"><Trash2 className="w-3 h-3" /></button>
      </div>

      {/* Sponsored label */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-bold text-gray-800 bg-gray-200 px-1 rounded">Sponsored</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${ad.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{ad.status}</span>
      </div>

      {/* Display URL */}
      <p className="text-green-800 text-xs flex items-center gap-1">
        <span className="inline-block w-4 h-4 bg-green-100 rounded-full text-center text-[8px] leading-4 font-bold text-green-800">A</span>
        {displayUrl}
      </p>

      {/* Headlines — max 3 shown, pipe-separated like Google */}
      <p className="text-blue-800 text-base font-medium leading-snug mt-1 hover:underline cursor-default">
        {showHeadlines.map((h) => h.text).join(' | ')}
      </p>

      {/* Descriptions — max 2 shown */}
      <p className="text-gray-700 text-xs mt-1 leading-relaxed">
        {showDescs.map((d) => d.text).join(' ')}
      </p>

      {/* Combination navigator */}
      {totalCombinations > 1 && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200">
          <span className="text-[10px] text-gray-400">
            Preview {previewIndex + 1}/{totalCombinations} &middot; {headlines.length} headlines, {descriptions.length} descriptions
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPreviewIndex((p) => (p - 1 + totalCombinations) % totalCombinations)} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600">&larr;</button>
            <button onClick={() => setPreviewIndex((p) => (p + 1) % totalCombinations)} className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600">&rarr;</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Match Type Badge
// ============================================================

function MatchBadge({ type }: { type: string }) {
  if (type === 'EXACT') return <span className="text-xs font-mono bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded">[exact]</span>;
  if (type === 'PHRASE') return <span className="text-xs font-mono bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">&quot;phrase&quot;</span>;
  return <span className="text-xs font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">broad</span>;
}

// ============================================================
// Main Page
// ============================================================

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'structure' | 'performance' | 'settings'>('structure');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: string; id: string; name: string } | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // Settings form state
  const [editName, setEditName] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editBidding, setEditBidding] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  useEffect(() => { fetchCampaign(); }, [id]);

  async function fetchCampaign() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCampaign(data);
      setExpandedGroups(new Set((data.ad_groups || []).map((ag: { id: string }) => ag.id)));
      setEditName(data.name);
      setEditBudget((data.budget_amount_micros / 1_000_000).toString());
      setEditBidding(data.bidding_strategy);
    } catch { setCampaign(null); }
    setLoading(false);
  }

  async function toggleStatus() {
    if (!campaign) return;
    setActionLoading(true);
    const newStatus = campaign.status === 'active' ? 'paused' : 'active';
    await fetch(`/api/campaigns/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
    fetchCampaign();
    setActionLoading(false);
  }

  async function deleteEntity(type: string, entityId: string) {
    await fetch('/api/entities/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: type, entity_id: entityId }),
    });

    setConfirmDelete(null);

    if (type === 'campaign') {
      router.push('/campaigns');
    } else {
      fetchCampaign();
    }
  }

  async function submitToGoogleAds() {
    setSubmitLoading(true);
    setSubmitResult(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/submit`, { method: 'POST' });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      if (data.qa?.passed) {
        setSubmitResult({ success: true, message: `QA passed. Submitted to approval queue. Go to Approvals to review and push to Google Ads.` });
      } else {
        const issues = (data.qa?.errors || []).map((e: { message: string }) => e.message).join(', ');
        setSubmitResult({ success: true, message: `Submitted with QA warnings: ${issues}. Review in Approvals.` });
      }
    } catch (err) {
      setSubmitResult({ success: false, message: err instanceof Error ? err.message : 'Submit failed' });
    }
    setSubmitLoading(false);
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsSaving(true);
    await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        budget_amount_micros: Math.round(parseFloat(editBudget) * 1_000_000),
        bidding_strategy: editBidding,
      }),
    });
    fetchCampaign();
    setSettingsSaving(false);
  }

  function toggleGroup(gid: string) {
    setExpandedGroups((prev) => { const n = new Set(prev); n.has(gid) ? n.delete(gid) : n.add(gid); return n; });
  }

  if (loading) return <div className="text-gray-500 text-center py-12">Loading campaign...</div>;
  if (!campaign) return <div className="text-red-400 text-center py-12">Campaign not found</div>;

  const perf = campaign.performance || [];
  const totalImpr = perf.reduce((s, p) => s + p.impressions, 0);
  const totalClicks = perf.reduce((s, p) => s + p.clicks, 0);
  const totalSpend = perf.reduce((s, p) => s + p.cost_micros, 0);
  const totalConv = perf.reduce((s, p) => s + p.conversions, 0);
  const ctr = totalImpr > 0 ? (totalClicks / totalImpr * 100).toFixed(2) : '0.00';
  const cpa = totalConv > 0 ? fmt(Math.round(totalSpend / totalConv)) : '—';

  const tabs = [
    { key: 'structure' as const, label: 'Structure', icon: Layers },
    { key: 'performance' as const, label: 'Performance', icon: BarChart3 },
    { key: 'settings' as const, label: 'Settings', icon: Settings2 },
  ];

  return (
    <div>
      {/* Confirm Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.type.replace('_', ' ')}?`}
          message={confirmDelete.type === 'campaign'
            ? 'This will remove the entire campaign including all ad groups, ads, and keywords.'
            : confirmDelete.type === 'ad_group'
            ? `This will remove "${confirmDelete.name}" and all its ads and keywords.`
            : `This will remove this ${confirmDelete.type.replace('_', ' ')}.`}
          onConfirm={() => deleteEntity(confirmDelete.type, confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/campaigns" className="p-2 hover:bg-gray-800 rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-400" /></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${campaign.status === 'active' ? 'bg-green-600' : campaign.status === 'paused' ? 'bg-yellow-600' : 'bg-gray-600'} text-white`}>{campaign.status}</span>
            </div>
            <p className="text-sm text-gray-500">{campaign.campaign_type} &middot; {fmt(campaign.budget_amount_micros)}/day &middot; Created {timeAgo(campaign.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleStatus} disabled={actionLoading} title={campaign.google_campaign_id ? 'Toggle on Google Ads' : 'Local status only — submit for approval to push to Google Ads'} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg">
            {campaign.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {campaign.status === 'active' ? 'Pause' : 'Activate'}
          </button>
          <Link href={`/campaigns/${id}/edit`} className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-sm rounded-lg text-white"><Pencil className="w-4 h-4" /> Edit</Link>
          <button onClick={() => setConfirmDelete({ type: 'campaign', id, name: campaign.name })} className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg"><Trash2 className="w-4 h-4" /> Delete</button>
          {!campaign.google_campaign_id && (
            <button onClick={submitToGoogleAds} disabled={submitLoading} className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white text-sm rounded-lg font-medium">
              {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit to Google Ads
            </button>
          )}
          {campaign.google_campaign_id && (
            <span className="flex items-center gap-1.5 px-3 py-2 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> On Google Ads</span>
          )}
        </div>
      </div>

      {/* Submit result banner */}
      {submitResult && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${submitResult.success ? 'bg-green-900/30 border border-green-800 text-green-300' : 'bg-red-900/30 border border-red-800 text-red-300'}`}>
          {submitResult.message}
          {submitResult.success && <Link href="/approvals" className="ml-2 underline">Go to Approvals →</Link>}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Impressions', value: totalImpr.toLocaleString() },
          { label: 'Clicks', value: totalClicks.toLocaleString() },
          { label: 'CTR', value: `${ctr}%` },
          { label: 'Spend', value: fmt(totalSpend) },
          { label: 'Conversions', value: totalConv.toFixed(1) },
          { label: 'CPA', value: cpa },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-lg font-bold mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Structure */}
      {activeTab === 'structure' && (
        <div>
          {/* Campaign-level negative keywords */}
          {campaign.negative_keywords.length > 0 && (
            <div className="mb-4 p-3 bg-gray-900 border border-gray-800 rounded-lg">
              <p className="text-xs font-medium text-gray-400 mb-2">Campaign Negative Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.negative_keywords.map((nk) => (
                  <span key={nk.id} className="px-2 py-0.5 bg-red-900/30 text-red-300 text-xs rounded">{nk.text}</span>
                ))}
              </div>
            </div>
          )}

          {/* Ad Groups */}
          {campaign.ad_groups.length > 0 ? (
            <div className="space-y-4">
              {campaign.ad_groups.filter((ag) => ag.status !== 'removed').map((ag) => (
                <div key={ag.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {/* Ad Group Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-800">
                    <button onClick={() => toggleGroup(ag.id)} className="flex items-center gap-2 flex-1 text-left">
                      {expandedGroups.has(ag.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      <span className="font-semibold">{ag.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${ag.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>{ag.status}</span>
                      {ag.cpc_bid_micros && <span className="text-xs text-gray-500">Bid: {fmt(ag.cpc_bid_micros)}</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{ag.ads.filter((a) => a.status !== 'removed').length} ads &middot; {ag.keywords.filter((k) => k.status !== 'removed').length} keywords</span>
                      <button onClick={() => setConfirmDelete({ type: 'ad_group', id: ag.id, name: ag.name })} className="p-1.5 hover:bg-red-600/20 rounded text-gray-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedGroups.has(ag.id) && (
                    <div className="p-4 space-y-4">
                      {/* Keywords */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Keywords ({ag.keywords.filter((k) => k.status !== 'removed').length})</h4>
                        {ag.keywords.filter((k) => k.status !== 'removed').length > 0 ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500">
                                <th className="pb-2 font-medium">Keyword</th>
                                <th className="pb-2 font-medium">Match Type</th>
                                <th className="pb-2 font-medium text-center">QS</th>
                                <th className="pb-2 font-medium text-right">Bid</th>
                                <th className="pb-2 w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {ag.keywords.filter((k) => k.status !== 'removed').map((kw) => (
                                <tr key={kw.id} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2 text-gray-200">{kw.text}</td>
                                  <td className="py-2"><MatchBadge type={kw.match_type} /></td>
                                  <td className="py-2 text-center">{kw.quality_score ? <span className={`text-xs font-bold ${kw.quality_score >= 7 ? 'text-green-400' : kw.quality_score >= 4 ? 'text-yellow-400' : 'text-red-400'}`}>{kw.quality_score}/10</span> : <span className="text-gray-600">—</span>}</td>
                                  <td className="py-2 text-right text-gray-400">{kw.cpc_bid_micros ? fmt(kw.cpc_bid_micros) : '—'}</td>
                                  <td className="py-2"><button className="p-1 hover:bg-red-600/20 rounded text-gray-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-gray-600 text-xs">No keywords</p>
                        )}
                      </div>

                      {/* Negative Keywords */}
                      {ag.negative_keywords.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Negative Keywords</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {ag.negative_keywords.map((nk) => (
                              <span key={nk.id} className="px-2 py-0.5 bg-red-900/30 text-red-300 text-xs rounded flex items-center gap-1">
                                {nk.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ads */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Ads ({ag.ads.filter((a) => a.status !== 'removed').length})</h4>
                        {ag.ads.filter((a) => a.status !== 'removed').length > 0 ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {ag.ads.filter((a) => a.status !== 'removed').map((ad) => (
                              <AdPreviewCard key={ad.id} ad={ad} onDelete={(adId) => setConfirmDelete({ type: 'ad', id: adId, name: 'this ad' })} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-600 text-xs">No ads</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-600 text-sm text-center py-12 bg-gray-900 border border-gray-800 rounded-xl">No ad groups yet.</div>
          )}
        </div>
      )}

      {/* Tab: Performance */}
      {activeTab === 'performance' && (
        <div>
          {/* Daily Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Daily Spend (30 days)</h3>
            {perf.length > 0 ? (
              <div className="h-48 flex items-end gap-0.5">
                {perf.map((day) => {
                  const max = Math.max(...perf.map((d) => d.cost_micros)) || 1;
                  return (
                    <div key={day.date} className="flex-1 group relative" title={`${day.date}: ${fmt(day.cost_micros)} | ${day.clicks} clicks`}>
                      <div className="w-full bg-blue-500 hover:bg-blue-400 rounded-t transition-colors" style={{ height: `${Math.max((day.cost_micros / max) * 100, 2)}%` }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-600 text-sm text-center py-12">No performance data yet. Sync your Google Ads data.</p>
            )}
          </div>

          {/* Per Ad Group Performance */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">Performance by Ad Group</h3>
            <p className="text-gray-600 text-xs text-center py-8">Per-ad-group performance data will appear once campaigns are synced with Google Ads.</p>
          </div>
        </div>
      )}

      {/* Tab: Settings */}
      {activeTab === 'settings' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl">
          <form onSubmit={saveSettings} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Daily Budget ($)</label>
                <input type="number" step="0.01" value={editBudget} onChange={(e) => setEditBudget(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Bidding Strategy</label>
                <select value={editBidding} onChange={(e) => setEditBidding(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="MAXIMIZE_CLICKS">Maximize Clicks</option>
                  <option value="MAXIMIZE_CONVERSIONS">Maximize Conversions</option>
                  <option value="TARGET_CPA">Target CPA</option>
                  <option value="TARGET_ROAS">Target ROAS</option>
                  <option value="MANUAL_CPC">Manual CPC</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Type</label>
              <p className="text-sm text-gray-300 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">{campaign.campaign_type}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Target Locations</label>
              <p className="text-sm text-gray-300 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">{campaign.geo_targets.map((g) => g.country || g.region || g.city).join(', ') || 'All locations'}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Languages</label>
              <p className="text-sm text-gray-300 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">{campaign.language_targets.join(', ') || 'en'}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Networks</label>
              <div className="flex gap-4 text-sm text-gray-300">
                <span>{campaign.network_settings.search ? '✓' : '✗'} Search</span>
                <span>{campaign.network_settings.display ? '✓' : '✗'} Display</span>
                <span>{campaign.network_settings.partners ? '✓' : '✗'} Partners</span>
              </div>
            </div>
            <button type="submit" disabled={settingsSaving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg flex items-center gap-2">
              {settingsSaving && <Loader2 className="w-4 h-4 animate-spin" />} Save Settings
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
