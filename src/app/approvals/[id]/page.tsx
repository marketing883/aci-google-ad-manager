'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, X, Pencil, Loader2 } from 'lucide-react';

interface ApprovalDetail {
  id: string;
  action_type: string;
  entity_type: string;
  payload: Record<string, unknown>;
  previous_state: Record<string, unknown> | null;
  status: string;
  ai_reasoning: string | null;
  confidence_score: number | null;
  priority: string;
  agent_name: string | null;
  reviewer_notes: string | null;
  error_message: string | null;
  created_at: string;
}

export default function ApprovalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [item, setItem] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  useEffect(() => { fetchDetail(); }, [id]);

  async function fetchDetail() {
    setLoading(true);
    try {
      const res = await fetch(`/api/approvals/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setItem(data);
    } catch { setItem(null); }
    setLoading(false);
  }

  async function handleApprove() {
    setActionLoading('approve');
    try {
      await fetch(`/api/approvals/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      router.push('/approvals');
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setActionLoading('reject');
    try {
      await fetch(`/api/approvals/${id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewer_notes: rejectReason }) });
      router.push('/approvals');
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  if (loading) return <div className="text-gray-500 text-center py-12">Loading...</div>;
  if (!item) return <div className="text-red-400 text-center py-12">Approval item not found</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/approvals" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{item.action_type.replace(/_/g, ' ')}</h1>
          <p className="text-sm text-gray-500">
            {item.entity_type} &bull; {item.agent_name || 'Manual'} &bull; {new Date(item.created_at).toLocaleString()}
            {item.entity_id && item.entity_type === 'campaign' && (
              <> &bull; <Link href={`/campaigns/${item.entity_id}`} className="text-blue-400 hover:text-blue-300">View campaign</Link></>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diff View */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Proposed Changes</h2>
          {/* Full campaign structure for campaign pushes */}
          {item.action_type === 'push_to_google_ads' && item.payload ? (
            <div className="space-y-4">
              {/* Campaign overview */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Campaign Settings</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-400">Name:</span> <span className="text-white font-medium">{item.payload.campaign_name as string}</span></div>
                  <div><span className="text-gray-400">Type:</span> <span className="text-white">{item.payload.campaign_type as string}</span></div>
                  <div><span className="text-gray-400">Budget:</span> <span className="text-white">${((item.payload.budget_micros as number || item.payload.budget as number || 0) / 1_000_000).toFixed(2)}/{item.payload.budget_type as string || 'day'}</span></div>
                  <div><span className="text-gray-400">Bidding:</span> <span className="text-white">{(item.payload.bidding_strategy as string || '—').replace(/_/g, ' ')}</span></div>
                  {item.payload.target_cpa_micros && <div><span className="text-gray-400">Target CPA:</span> <span className="text-white">${((item.payload.target_cpa_micros as number) / 1_000_000).toFixed(2)}</span></div>}
                  {item.payload.target_roas && <div><span className="text-gray-400">Target ROAS:</span> <span className="text-white">{item.payload.target_roas as number}x</span></div>}
                  <div><span className="text-gray-400">Start Date:</span> <span className="text-white">{(item.payload.start_date as string) || 'Immediately'}</span></div>
                  <div><span className="text-gray-400">End Date:</span> <span className="text-white">{(item.payload.end_date as string) || 'No end date'}</span></div>
                  <div><span className="text-gray-400">Locations:</span> <span className="text-white">{Array.isArray(item.payload.geo_targets) ? (item.payload.geo_targets as Array<{country?: string}>).map((g) => g.country || JSON.stringify(g)).join(', ') : '—'}</span></div>
                  <div><span className="text-gray-400">Languages:</span> <span className="text-white">{Array.isArray(item.payload.language_targets) ? (item.payload.language_targets as string[]).join(', ') : '—'}</span></div>
                  {item.payload.network_settings && <div><span className="text-gray-400">Networks:</span> <span className="text-white">{[(item.payload.network_settings as {search?: boolean}).search && 'Search', (item.payload.network_settings as {display?: boolean}).display && 'Display', (item.payload.network_settings as {partners?: boolean}).partners && 'Partners'].filter(Boolean).join(', ') || '—'}</span></div>}
                  <div><span className="text-gray-400">Totals:</span> <span className="text-white">{item.payload.ad_groups_count as number} ad groups, {item.payload.ads_count as number} ads, {item.payload.keywords_count as number} keywords</span></div>
                </div>
              </div>

              {/* Ad groups with keywords and ads */}
              {Array.isArray(item.payload.ad_groups) && (item.payload.ad_groups as Array<{name: string; bid_micros?: number; keywords?: Array<{text: string; match_type: string}>; ads?: Array<{headlines: Array<{text: string}>; descriptions: Array<{text: string}>; final_urls: string[]}>}>).map((ag, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">{ag.name}</h3>
                    {ag.bid_micros && <span className="text-xs text-gray-400">Bid: ${(ag.bid_micros / 1_000_000).toFixed(2)}</span>}
                  </div>

                  {/* Keywords */}
                  {ag.keywords && ag.keywords.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-400 mb-1.5">Keywords ({ag.keywords.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {ag.keywords.map((kw, j) => (
                          <span key={j} className={`px-2 py-0.5 text-xs rounded ${kw.match_type === 'EXACT' ? 'bg-blue-900/40 text-blue-300' : kw.match_type === 'PHRASE' ? 'bg-purple-900/40 text-purple-300' : 'bg-gray-700 text-gray-300'}`}>
                            {kw.match_type === 'EXACT' ? `[${kw.text}]` : kw.match_type === 'PHRASE' ? `"${kw.text}"` : kw.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ads */}
                  {ag.ads && ag.ads.map((ad, k) => (
                    <div key={k} className="bg-white rounded-lg p-3 mb-2">
                      <p className="text-[10px] text-gray-500 mb-1">Ad {k + 1}</p>
                      <p className="text-blue-800 text-sm font-medium leading-snug">
                        {ad.headlines?.slice(0, 3).map((h) => typeof h === 'string' ? h : h.text).join(' | ')}
                      </p>
                      {ad.final_urls?.[0] && (
                        <p className="text-green-700 text-xs mt-0.5">{(() => { try { return new URL(ad.final_urls[0]).hostname; } catch { return ad.final_urls[0]; } })()}</p>
                      )}
                      <p className="text-gray-600 text-xs mt-1">
                        {ad.descriptions?.slice(0, 2).map((d) => typeof d === 'string' ? d : d.text).join(' ')}
                      </p>
                      {ad.headlines?.length > 3 && (
                        <p className="text-[10px] text-gray-400 mt-1">+ {ad.headlines.length - 3} more headlines, {(ad.descriptions?.length || 0) > 2 ? `${ad.descriptions.length - 2} more descriptions` : ''}</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm text-gray-400 mb-2">Before</h3>
                <pre className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-300 min-h-[200px] overflow-auto whitespace-pre-wrap">
                  {item.previous_state ? JSON.stringify(item.previous_state, null, 2) : 'New entity (no previous state)'}
                </pre>
              </div>
              <div>
                <h3 className="text-sm text-gray-400 mb-2">After</h3>
                <pre className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-green-300 min-h-[200px] overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Info + Actions */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">AI Reasoning</h2>
            <p className="text-gray-400 text-sm">{item.ai_reasoning || 'No reasoning provided'}</p>
            {item.confidence_score !== null && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-gray-400">Confidence:</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full">
                  <div className={`h-2 rounded-full ${item.confidence_score > 0.7 ? 'bg-green-500' : item.confidence_score > 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${item.confidence_score * 100}%` }} />
                </div>
                <span className="text-sm text-gray-400">{(item.confidence_score * 100).toFixed(0)}%</span>
              </div>
            )}
            {item.error_message && (
              <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">{item.error_message}</div>
            )}
          </div>

          {item.status === 'pending' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <button onClick={handleApprove} disabled={!!actionLoading} className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                {actionLoading === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Approve & Apply
              </button>

              {!showRejectInput ? (
                <button onClick={() => setShowRejectInput(true)} className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                  <X className="w-4 h-4" />
                  Reject
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection (required)" rows={3} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" />
                  <button onClick={handleReject} disabled={!rejectReason.trim() || !!actionLoading} className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                    {actionLoading === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Rejection'}
                  </button>
                </div>
              )}
            </div>
          )}

          {item.status === 'failed' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                <p className="text-sm font-medium text-red-400">Push to Google Ads Failed</p>
              </div>
              {item.error_message && (
                <p className="text-xs text-gray-400 bg-gray-800 p-2 rounded">{item.error_message}</p>
              )}
              <button onClick={async () => {
                setActionLoading('retry');
                try {
                  await fetch(`/api/approvals/${id}/retry`, { method: 'POST' });
                  fetchDetail();
                } catch { /* ignore */ }
                setActionLoading(null);
              }} disabled={!!actionLoading} className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                {actionLoading === 'retry' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Retry Push to Google Ads'}
              </button>
            </div>
          )}

          {item.status === 'applied' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <p className="text-sm font-medium text-green-400">Successfully pushed to Google Ads</p>
              </div>
              {item.reviewer_notes && <p className="text-sm text-gray-500 mt-2">Notes: {item.reviewer_notes}</p>}
            </div>
          )}

          {item.status === 'approved' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-400" />
                <p className="text-sm font-medium text-blue-400">Approved — awaiting push to Google Ads</p>
              </div>
              {item.reviewer_notes && <p className="text-sm text-gray-500 mt-2">Notes: {item.reviewer_notes}</p>}
            </div>
          )}

          {item.status === 'rejected' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-400">Status: <span className="font-medium text-red-400">Rejected</span></p>
              {item.reviewer_notes && <p className="text-sm text-gray-500 mt-2">Reason: {item.reviewer_notes}</p>}
            </div>
          )}

          {item.status === 'expired' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-400">Status: <span className="font-medium text-gray-500">Expired</span></p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
