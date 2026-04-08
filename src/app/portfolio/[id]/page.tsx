'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Trash2, Loader2, MessageSquare, Tag, FileText,
  ChevronRight, DollarSign, Target, RefreshCw, ExternalLink, Plus,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface AdData {
  id: string;
  ad_group_id: string;
  headlines: Array<{ text: string }>;
  descriptions: Array<{ text: string }>;
  final_urls: string[];
  status: string;
}

interface KeywordData {
  id: string;
  text: string;
  match_type: string;
  status: string;
}

interface AdGroupData {
  id: string;
  name: string;
  status: string;
  cpc_bid_micros: number;
  ads: AdData[];
  keywords: KeywordData[];
  negative_keywords: Array<{ keyword_text: string }>;
}

interface CampaignDetail {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_amount_micros: number;
  bidding_strategy: string;
  created_at: string;
  google_campaign_id: string | null;
  last_synced_at: string | null;
  targets: Record<string, unknown>;
  ad_groups: AdGroupData[];
  negative_keywords: Array<{ keyword_text: string }>;
}

const statusBadge = (status: string) => {
  const c: Record<string, string> = {
    active: 'bg-green-600/20 text-green-400', paused: 'bg-yellow-600/20 text-yellow-400',
    draft: 'bg-gray-700 text-gray-400', removed: 'bg-red-600/20 text-red-400',
    pending_approval: 'bg-purple-600/20 text-purple-400', approved: 'bg-blue-600/20 text-blue-400',
  };
  return c[status] || 'bg-gray-700 text-gray-400';
};

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

// ============================================================
// Delete Modal
// ============================================================

function DeleteModal({ title, description, onConfirm, onCancel }: {
  title: string; description: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-400" /></div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-gray-400 mb-6">{description}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete Permanently</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Campaign Detail Page
// ============================================================

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'campaign' | 'ad_group' | 'ad';
    id: string;
    name: string;
    parentId?: string;
  } | null>(null);

  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setCampaign(data);
    } catch {
      setCampaign(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  async function handleDelete() {
    if (!deleteTarget) return;
    let url = '';
    if (deleteTarget.type === 'campaign') {
      url = `/api/campaigns/${id}?hard=true`;
    } else if (deleteTarget.type === 'ad_group') {
      url = `/api/campaigns/${id}/ad-groups/${deleteTarget.id}?hard=true`;
    } else if (deleteTarget.type === 'ad') {
      url = `/api/campaigns/${id}/ad-groups/${deleteTarget.parentId}/ads/${deleteTarget.id}?hard=true`;
    }
    await fetch(url, { method: 'DELETE' });
    setDeleteTarget(null);
    if (deleteTarget.type === 'campaign') {
      router.push('/portfolio');
    } else {
      setSelectedGroup(null);
      fetchCampaign();
    }
  }

  const selectedAdGroup = campaign?.ad_groups?.find((ag) => ag.id === selectedGroup);

  if (loading) {
    return <div className="text-gray-500 text-center py-20"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading campaign...</div>;
  }

  if (!campaign) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 mb-4">Campaign not found.</p>
        <Link href="/portfolio" className="text-blue-400 hover:text-blue-300">Back to Portfolio</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb + Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/portfolio" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{campaign.name}</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusBadge(campaign.status)}`}>{campaign.status}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{campaign.campaign_type} &middot; {fmt(campaign.budget_amount_micros)}/day &middot; {campaign.bidding_strategy}</span>
              {campaign.google_campaign_id && (
                <a href={`https://ads.google.com/aw/campaigns?campaignId=${campaign.google_campaign_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  <ExternalLink className="w-3 h-3" /> View on Google Ads
                </a>
              )}
              {campaign.last_synced_at && (
                <span className="text-gray-600">Synced {new Date(campaign.last_synced_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchCampaign} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => {
              const msg = encodeURIComponent(`Analyze the campaign "${campaign.name}" — what's working, what's not, and what should I change?`);
              router.push(`/chat?prefill=${msg}`);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-blue-600/10 rounded-lg"
          >
            <MessageSquare className="w-4 h-4" /> Edit in Chat
          </button>
          <button
            onClick={() => setDeleteTarget({ type: 'campaign', id: campaign.id, name: campaign.name })}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-600/10 rounded-lg"
          >
            <Trash2 className="w-4 h-4" /> Delete Campaign
          </button>
        </div>
      </div>

      {/* Campaign-level Negative Keywords */}
      {campaign.negative_keywords?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Campaign-Level Negative Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {campaign.negative_keywords.map((nk, i) => (
              <span key={i} className="px-2 py-0.5 bg-red-600/10 text-red-400 rounded text-xs">{nk.keyword_text}</span>
            ))}
          </div>
        </div>
      )}

      {/* Two-panel layout: Ad Groups list | Selected Ad Group detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Ad Groups List */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Ad Groups ({campaign.ad_groups?.length || 0})
          </h2>
          <button
            onClick={() => {
              const msg = encodeURIComponent(`Add a new ad group to campaign "${campaign.name}" (campaign ID: ${campaign.id}). Ask me what theme and keywords.`);
              router.push(`/chat?prefill=${msg}`);
            }}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-3"
          >
            <Plus className="w-3.5 h-3.5" /> Add Ad Group via Chat
          </button>
          <div className="space-y-2">
            {campaign.ad_groups?.length > 0 ? campaign.ad_groups.map((ag) => (
              <div
                key={ag.id}
                onClick={() => setSelectedGroup(ag.id)}
                className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-colors ${
                  selectedGroup === ag.id ? 'border-blue-600 bg-blue-600/5' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Tag className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="font-medium text-white text-sm truncate">{ag.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge(ag.status)}`}>{ag.status}</span>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{ag.keywords?.length || 0} keywords</span>
                  <span>{ag.ads?.length || 0} ads</span>
                  {ag.cpc_bid_micros > 0 && <span>{fmt(ag.cpc_bid_micros)} CPC</span>}
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-600 p-4">No ad groups.</p>
            )}
          </div>
        </div>

        {/* Right: Selected Ad Group Detail */}
        <div className="lg:col-span-2">
          {selectedAdGroup ? (
            <div>
              {/* Ad Group Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{selectedAdGroup.name}</h2>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusBadge(selectedAdGroup.status)}`}>{selectedAdGroup.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedAdGroup.keywords?.length || 0} keywords &middot; {selectedAdGroup.ads?.length || 0} ads
                    {selectedAdGroup.cpc_bid_micros > 0 && ` · ${fmt(selectedAdGroup.cpc_bid_micros)} CPC bid`}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteTarget({ type: 'ad_group', id: selectedAdGroup.id, name: selectedAdGroup.name })}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:bg-red-600/10 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" /> Delete Group
                </button>
                <button
                  onClick={() => {
                    const msg = encodeURIComponent(`Edit the ad group "${selectedAdGroup.name}" in campaign "${campaign.name}". What would you like to change?`);
                    router.push(`/chat?prefill=${msg}`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-400 hover:bg-blue-600/10 rounded-lg"
                >
                  <MessageSquare className="w-4 h-4" /> Edit in Chat
                </button>
              </div>

              {/* Keywords */}
              {selectedAdGroup.keywords?.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Keywords ({selectedAdGroup.keywords.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAdGroup.keywords.map((kw) => (
                      <span key={kw.id} className={`px-2.5 py-1 rounded text-xs font-mono ${
                        kw.match_type === 'EXACT' ? 'bg-blue-600/15 text-blue-400' :
                        kw.match_type === 'PHRASE' ? 'bg-purple-600/15 text-purple-400' :
                        'bg-gray-800 text-gray-300'
                      }`}>
                        {kw.match_type === 'EXACT' ? `[${kw.text}]` : kw.match_type === 'PHRASE' ? `"${kw.text}"` : kw.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Negative Keywords (group level) */}
              {selectedAdGroup.negative_keywords?.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Negative Keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAdGroup.negative_keywords.map((nk, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-600/10 text-red-400 rounded text-xs">{nk.keyword_text}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ads */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Ads ({selectedAdGroup.ads?.length || 0})</p>
                {selectedAdGroup.ads?.length > 0 ? (
                  <div className="space-y-3">
                    {selectedAdGroup.ads.map((ad) => (
                      <div key={ad.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-4 h-4 text-purple-400" />
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge(ad.status)}`}>{ad.status}</span>
                            </div>
                            {/* Headlines */}
                            <div className="mb-2">
                              <p className="text-[10px] text-gray-600 mb-1">HEADLINES</p>
                              <div className="space-y-0.5">
                                {ad.headlines?.map((h, i) => (
                                  <p key={i} className="text-sm text-blue-400">{h.text}</p>
                                ))}
                              </div>
                            </div>
                            {/* Descriptions */}
                            <div className="mb-2">
                              <p className="text-[10px] text-gray-600 mb-1">DESCRIPTIONS</p>
                              <div className="space-y-0.5">
                                {ad.descriptions?.map((d, i) => (
                                  <p key={i} className="text-xs text-gray-400">{d.text}</p>
                                ))}
                              </div>
                            </div>
                            {/* URL */}
                            {ad.final_urls?.[0] && (
                              <a href={ad.final_urls[0]} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-600 hover:text-blue-400 block">{ad.final_urls[0]}</a>
                            )}
                          </div>
                          <button
                            onClick={() => setDeleteTarget({ type: 'ad', id: ad.id, name: ad.headlines?.[0]?.text || 'Ad', parentId: selectedAdGroup.id })}
                            className="text-red-400/40 hover:text-red-400 ml-3 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 bg-gray-900 border border-gray-800 rounded-xl p-4">No ads in this ad group.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-gray-900 border border-gray-800 rounded-xl">
              <p className="text-gray-600 text-sm">Select an ad group to view its keywords and ads</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteModal
          title={`Delete ${deleteTarget.type === 'campaign' ? 'Campaign' : deleteTarget.type === 'ad_group' ? 'Ad Group' : 'Ad'}`}
          description={
            deleteTarget.type === 'campaign'
              ? `Permanently delete "${deleteTarget.name}" and ALL its ad groups, ads, and keywords? This cannot be undone.`
              : deleteTarget.type === 'ad_group'
              ? `Permanently delete ad group "${deleteTarget.name}" and all its ads and keywords?`
              : `Permanently delete ad "${deleteTarget.name}"?`
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
