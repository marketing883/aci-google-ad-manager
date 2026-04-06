'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PieChart, RefreshCw, Loader2, MessageSquare, AlertTriangle, ArrowRight,
  Zap, Trash2,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface CampaignWithStats {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_amount_micros: number;
  bidding_strategy: string;
  created_at: string;
  ad_groups_count: number;
  stats?: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
  };
}

interface PortfolioMetrics {
  total_spend: number;
  total_conversions: number;
  total_clicks: number;
  total_impressions: number;
  avg_cpa: number | null;
  avg_ctr: number;
  campaign_count: number;
  active_count: number;
}

// ============================================================
// Health Score
// ============================================================

interface HealthGrade {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  color: string;
  bgColor: string;
  reasons: string[];
}

function calculateHealthGrade(campaign: CampaignWithStats): HealthGrade {
  const reasons: string[] = [];
  let score = 50;
  const stats = campaign.stats;
  if (!stats || stats.impressions === 0) {
    return { grade: 'F', score: 0, color: 'text-gray-400', bgColor: 'bg-gray-700', reasons: ['No performance data'] };
  }
  const ctr = stats.ctr || (stats.impressions > 0 ? stats.clicks / stats.impressions : 0);
  if (ctr >= 0.05) { score += 25; reasons.push('Excellent CTR (>5%)'); }
  else if (ctr >= 0.03) { score += 15; reasons.push('Good CTR (3-5%)'); }
  else if (ctr >= 0.01) { score += 5; reasons.push('Average CTR (1-3%)'); }
  else { score -= 10; reasons.push('Low CTR (<1%)'); }
  if (stats.conversions > 0) {
    const cpa = stats.cost_micros / stats.conversions;
    const budget = campaign.budget_amount_micros;
    if (budget <= 0) { score += 15; }
    else if (cpa <= budget * 0.5) { score += 30; reasons.push('Great CPA'); }
    else if (cpa <= budget) { score += 20; }
    else if (cpa <= budget * 2) { score += 5; }
    else { score -= 10; reasons.push('CPA exceeds 2x budget'); }
  } else if (stats.cost_micros > 0) { score -= 15; reasons.push('No conversions'); }
  if (stats.cost_micros > 0 && stats.clicks > 0) {
    const avgCpc = stats.cost_micros / stats.clicks;
    if (avgCpc <= 2_000_000) score += 15;
    else if (avgCpc <= 5_000_000) score += 10;
  }
  score = Math.max(0, Math.min(100, score));
  let grade: HealthGrade['grade'], color: string, bgColor: string;
  if (score >= 80) { grade = 'A'; color = 'text-green-400'; bgColor = 'bg-green-600'; }
  else if (score >= 60) { grade = 'B'; color = 'text-blue-400'; bgColor = 'bg-blue-600'; }
  else if (score >= 40) { grade = 'C'; color = 'text-yellow-400'; bgColor = 'bg-yellow-600'; }
  else if (score >= 20) { grade = 'D'; color = 'text-orange-400'; bgColor = 'bg-orange-600'; }
  else { grade = 'F'; color = 'text-red-400'; bgColor = 'bg-red-600'; }
  return { grade, score, color, bgColor, reasons };
}

function getOverallGrade(campaigns: CampaignWithStats[]): HealthGrade {
  const active = campaigns.filter((c) => c.status === 'active' && c.stats);
  if (active.length === 0) return { grade: 'F', score: 0, color: 'text-gray-400', bgColor: 'bg-gray-700', reasons: [] };
  const avg = active.reduce((s, c) => s + calculateHealthGrade(c).score, 0) / active.length;
  const grade = avg >= 80 ? 'A' : avg >= 60 ? 'B' : avg >= 40 ? 'C' : avg >= 20 ? 'D' : 'F';
  const color = avg >= 80 ? 'text-green-400' : avg >= 60 ? 'text-blue-400' : avg >= 40 ? 'text-yellow-400' : avg >= 20 ? 'text-orange-400' : 'text-red-400';
  const bgColor = avg >= 80 ? 'bg-green-600' : avg >= 60 ? 'bg-blue-600' : avg >= 40 ? 'bg-yellow-600' : avg >= 20 ? 'bg-orange-600' : 'bg-red-600';
  return { grade: grade as HealthGrade['grade'], score: Math.round(avg), color, bgColor, reasons: [] };
}

function getRecommendation(campaign: CampaignWithStats, health: HealthGrade): string {
  if (!campaign.stats || campaign.stats.impressions === 0) return 'No data yet — sync or wait for campaign to start.';
  if (campaign.stats.conversions === 0 && campaign.stats.cost_micros > 5_000_000) return 'Spending without conversions. Review keywords or landing page.';
  if (health.grade === 'A') return 'Top performer — consider increasing budget.';
  if (health.grade === 'B') return 'Performing well. Test new ad copy.';
  if (campaign.stats.ctr < 0.01) return 'Low CTR — ad copy needs work.';
  if (health.grade === 'D' || health.grade === 'F') return 'Underperforming. Ask AI to investigate.';
  return 'Stable. Monitor for opportunities.';
}

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

const statusBadge = (status: string) => {
  const c: Record<string, string> = {
    active: 'bg-green-600/20 text-green-400', paused: 'bg-yellow-600/20 text-yellow-400',
    draft: 'bg-gray-700 text-gray-400', removed: 'bg-red-600/20 text-red-400',
    pending_approval: 'bg-purple-600/20 text-purple-400', approved: 'bg-blue-600/20 text-blue-400',
  };
  return c[status] || 'bg-gray-700 text-gray-400';
};

// ============================================================
// Delete Confirmation Modal
// ============================================================

function DeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-600/20 flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-400" /></div>
          <h3 className="text-lg font-semibold text-white">Delete Campaign</h3>
        </div>
        <p className="text-sm text-gray-400 mb-6">Permanently delete <strong className="text-white">&quot;{name}&quot;</strong> and ALL its ad groups, ads, and keywords? This cannot be undone.</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete Permanently</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Campaign Card — clicks through to /portfolio/[id]
// ============================================================

function CampaignCard({ campaign, onDelete }: { campaign: CampaignWithStats; onDelete: () => void }) {
  const router = useRouter();
  const health = calculateHealthGrade(campaign);
  const recommendation = getRecommendation(campaign, health);
  const stats = campaign.stats;
  const spendPct = stats?.cost_micros && campaign.budget_amount_micros > 0
    ? Math.min(100, Math.round((stats.cost_micros / (campaign.budget_amount_micros * 30)) * 100)) : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/portfolio/${campaign.id}`} className="font-semibold text-white truncate hover:text-blue-400">
              {campaign.name}
            </Link>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusBadge(campaign.status)}`}>{campaign.status}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{campaign.campaign_type} &middot; {fmt(campaign.budget_amount_micros)}/day &middot; {campaign.ad_groups_count} ad groups</p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${health.bgColor} flex items-center justify-center shrink-0`}>
          <span className="text-white font-bold text-lg">{health.grade}</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div><p className="text-[10px] text-gray-500">Impressions</p><p className="text-sm font-semibold">{stats?.impressions?.toLocaleString() || '—'}</p></div>
        <div><p className="text-[10px] text-gray-500">Clicks</p><p className="text-sm font-semibold">{stats?.clicks?.toLocaleString() || '—'}</p></div>
        <div><p className="text-[10px] text-gray-500">CTR</p><p className="text-sm font-semibold">{stats ? `${((stats.ctr || 0) * 100).toFixed(1)}%` : '—'}</p></div>
        <div><p className="text-[10px] text-gray-500">Conv.</p><p className="text-sm font-semibold">{stats ? stats.conversions : '—'}</p></div>
      </div>

      {/* Spend bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Spend: {stats ? fmt(stats.cost_micros) : '$0'}</span>
          <span>{spendPct}% utilized</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full">
          <div className={`h-1.5 rounded-full ${spendPct > 90 ? 'bg-red-500' : spendPct > 60 ? 'bg-blue-500' : 'bg-gray-600'}`} style={{ width: `${spendPct}%` }} />
        </div>
      </div>

      {/* Recommendation */}
      <div className="flex items-start gap-2 p-2.5 bg-gray-800/50 rounded-lg mb-3">
        <Zap className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-400 leading-relaxed">{recommendation}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/portfolio/${campaign.id}`} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
            View Details <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            onClick={() => {
              const msg = encodeURIComponent(`Analyze the campaign "${campaign.name}" — what's working, what's not, and what should I change?`);
              router.push(`/chat?prefill=${msg}`);
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-400"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </button>
        </div>
        <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-red-400/50 hover:text-red-400">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function PortfolioPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [sortBy, setSortBy] = useState<'health' | 'spend' | 'conversions' | 'name'>('health');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns?status=all');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch { setCampaigns([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/campaigns/${deleteTarget.id}?hard=true`, { method: 'DELETE' });
    setDeleteTarget(null);
    fetchCampaigns();
  }

  const filtered = campaigns.filter((c) => filter === 'all' || c.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'health': return calculateHealthGrade(b).score - calculateHealthGrade(a).score;
      case 'spend': return (b.stats?.cost_micros || 0) - (a.stats?.cost_micros || 0);
      case 'conversions': return (b.stats?.conversions || 0) - (a.stats?.conversions || 0);
      case 'name': return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  const m: PortfolioMetrics = {
    total_spend: campaigns.reduce((s, c) => s + (c.stats?.cost_micros || 0), 0),
    total_conversions: campaigns.reduce((s, c) => s + (c.stats?.conversions || 0), 0),
    total_clicks: campaigns.reduce((s, c) => s + (c.stats?.clicks || 0), 0),
    total_impressions: campaigns.reduce((s, c) => s + (c.stats?.impressions || 0), 0),
    avg_cpa: null, avg_ctr: 0,
    campaign_count: campaigns.length,
    active_count: campaigns.filter((c) => c.status === 'active').length,
  };
  if (m.total_conversions > 0) m.avg_cpa = m.total_spend / m.total_conversions;
  if (m.total_impressions > 0) m.avg_ctr = m.total_clicks / m.total_impressions;
  const overallGrade = getOverallGrade(campaigns);
  const wastedSpend = campaigns.filter((c) => c.stats && c.stats.cost_micros > 0 && c.stats.conversions === 0).reduce((s, c) => s + (c.stats?.cost_micros || 0), 0);
  const spendByCampaign = campaigns.filter((c) => c.stats && c.stats.cost_micros > 0).sort((a, b) => (b.stats?.cost_micros || 0) - (a.stats?.cost_micros || 0));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PieChart className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Portfolio</h1>
            <p className="text-sm text-gray-500">Campaign health, budget flow, and management</p>
          </div>
        </div>
        <button onClick={fetchCampaigns} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
          <div className={`w-16 h-16 rounded-xl ${overallGrade.bgColor} flex items-center justify-center`}>
            <span className="text-white font-bold text-3xl">{overallGrade.grade}</span>
          </div>
          <div>
            <p className="text-sm text-gray-400">Portfolio Health</p>
            <p className="text-lg font-bold">{overallGrade.score}/100</p>
            <p className="text-xs text-gray-500">{m.active_count} active of {m.campaign_count}</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Spend (30d)</p>
          <p className="text-2xl font-bold">{fmt(m.total_spend)}</p>
          {wastedSpend > 0 && <p className="text-xs text-red-400 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{fmt(wastedSpend)} wasted</p>}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Conversions</p>
          <p className="text-2xl font-bold">{m.total_conversions.toFixed(1)}</p>
          <p className="text-xs text-gray-500">CPA: {m.avg_cpa ? fmt(m.avg_cpa) : '—'}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Avg CTR</p>
          <p className="text-2xl font-bold">{(m.avg_ctr * 100).toFixed(2)}%</p>
          <p className="text-xs text-gray-500">{m.total_clicks.toLocaleString()} clicks / {m.total_impressions.toLocaleString()} impr.</p>
        </div>
      </div>

      {/* Budget Flow */}
      {spendByCampaign.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Budget Flow</h2>
          <div className="space-y-2">
            {spendByCampaign.map((c) => {
              const pct = m.total_spend > 0 ? (c.stats!.cost_micros / m.total_spend) * 100 : 0;
              const hasConv = (c.stats?.conversions || 0) > 0;
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-40 truncate">{c.name}</span>
                  <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-5 rounded-full flex items-center px-2 ${hasConv ? 'bg-blue-600/60' : 'bg-red-600/40'}`} style={{ width: `${Math.max(pct, 3)}%` }}>
                      <span className="text-[10px] text-white font-medium whitespace-nowrap">{fmt(c.stats!.cost_micros)} ({pct.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <span className="text-xs w-16 text-right">{c.stats?.conversions || 0} conv.</span>
                  {!hasConv && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'active', 'paused', 'draft'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-sm rounded-lg capitalize ${filter === f ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {f} ({f === 'all' ? campaigns.length : campaigns.filter((c) => c.status === f).length})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Sort:</span>
          {(['health', 'spend', 'conversions', 'name'] as const).map((s) => (
            <button key={s} onClick={() => setSortBy(s)} className={`px-2 py-1 rounded capitalize ${sortBy === s ? 'bg-gray-800 text-white' : 'hover:text-white'}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Campaign Cards */}
      {loading ? (
        <div className="text-gray-500 text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading...</div>
      ) : sorted.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((c) => <CampaignCard key={c.id} campaign={c} onDelete={() => setDeleteTarget({ id: c.id, name: c.name })} />)}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <PieChart className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No campaigns yet</h2>
          <p className="text-gray-500 text-sm mb-4">Tell the AI to create your first campaign.</p>
          <Link href="/chat" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"><MessageSquare className="w-4 h-4" /> Open AI Chat</Link>
        </div>
      )}

      {deleteTarget && <DeleteModal name={deleteTarget.name} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />}
    </div>
  );
}
