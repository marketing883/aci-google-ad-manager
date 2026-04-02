'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PieChart, TrendingUp, TrendingDown, Minus, DollarSign,
  RefreshCw, Loader2, MessageSquare, AlertTriangle, ArrowRight,
  BarChart3, Target, Zap,
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
// Health Score Calculation
// ============================================================

interface HealthGrade {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number; // 0-100
  color: string;
  bgColor: string;
  reasons: string[];
}

function calculateHealthGrade(campaign: CampaignWithStats): HealthGrade {
  const reasons: string[] = [];
  let score = 50; // Start at C

  const stats = campaign.stats;
  if (!stats || stats.impressions === 0) {
    return {
      grade: 'F',
      score: 0,
      color: 'text-gray-400',
      bgColor: 'bg-gray-700',
      reasons: ['No performance data — campaign may not be running or not synced'],
    };
  }

  // CTR scoring (weight: 25)
  const ctr = stats.ctr || (stats.impressions > 0 ? stats.clicks / stats.impressions : 0);
  if (ctr >= 0.05) { score += 25; reasons.push('Excellent CTR (>5%)'); }
  else if (ctr >= 0.03) { score += 15; reasons.push('Good CTR (3-5%)'); }
  else if (ctr >= 0.01) { score += 5; reasons.push('Average CTR (1-3%)'); }
  else { score -= 10; reasons.push('Low CTR (<1%) — ad copy may need improvement'); }

  // Conversion scoring (weight: 30)
  if (stats.conversions > 0) {
    const cpa = stats.cost_micros / stats.conversions;
    const budget = campaign.budget_amount_micros;

    if (cpa <= budget * 0.5) { score += 30; reasons.push('Great CPA — well below daily budget'); }
    else if (cpa <= budget) { score += 20; reasons.push('Acceptable CPA'); }
    else if (cpa <= budget * 2) { score += 5; reasons.push('CPA is high relative to budget'); }
    else { score -= 10; reasons.push('CPA exceeds 2x daily budget — losing money per conversion'); }
  } else if (stats.cost_micros > 0) {
    score -= 15;
    reasons.push('Spending with zero conversions — check targeting or landing page');
  }

  // Spend efficiency (weight: 15)
  if (stats.cost_micros > 0 && stats.clicks > 0) {
    const avgCpc = stats.cost_micros / stats.clicks;
    if (avgCpc <= 2_000_000) { score += 15; reasons.push('Low CPC (<$2)'); }
    else if (avgCpc <= 5_000_000) { score += 10; reasons.push('Moderate CPC ($2-5)'); }
    else { score += 0; reasons.push('High CPC (>$5) — consider adjusting bids'); }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Map to grade
  let grade: HealthGrade['grade'];
  let color: string;
  let bgColor: string;

  if (score >= 80) { grade = 'A'; color = 'text-green-400'; bgColor = 'bg-green-600'; }
  else if (score >= 60) { grade = 'B'; color = 'text-blue-400'; bgColor = 'bg-blue-600'; }
  else if (score >= 40) { grade = 'C'; color = 'text-yellow-400'; bgColor = 'bg-yellow-600'; }
  else if (score >= 20) { grade = 'D'; color = 'text-orange-400'; bgColor = 'bg-orange-600'; }
  else { grade = 'F'; color = 'text-red-400'; bgColor = 'bg-red-600'; }

  return { grade, score, color, bgColor, reasons };
}

function getOverallGrade(campaigns: CampaignWithStats[]): HealthGrade {
  const activeCampaigns = campaigns.filter((c) => c.status === 'active' && c.stats);
  if (activeCampaigns.length === 0) {
    return { grade: 'F', score: 0, color: 'text-gray-400', bgColor: 'bg-gray-700', reasons: ['No active campaigns with data'] };
  }
  const avgScore = activeCampaigns.reduce((sum, c) => sum + calculateHealthGrade(c).score, 0) / activeCampaigns.length;
  const grade = avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : avgScore >= 20 ? 'D' : 'F';
  const color = avgScore >= 80 ? 'text-green-400' : avgScore >= 60 ? 'text-blue-400' : avgScore >= 40 ? 'text-yellow-400' : avgScore >= 20 ? 'text-orange-400' : 'text-red-400';
  const bgColor = avgScore >= 80 ? 'bg-green-600' : avgScore >= 60 ? 'bg-blue-600' : avgScore >= 40 ? 'bg-yellow-600' : avgScore >= 20 ? 'bg-orange-600' : 'bg-red-600';
  return { grade: grade as HealthGrade['grade'], score: Math.round(avgScore), color, bgColor, reasons: [] };
}

// ============================================================
// AI Recommendation (generated from data, not AI call)
// ============================================================

function getRecommendation(campaign: CampaignWithStats, health: HealthGrade): string {
  if (!campaign.stats || campaign.stats.impressions === 0) {
    return 'No data yet — sync Google Ads or wait for the campaign to start running.';
  }
  if (campaign.stats.conversions === 0 && campaign.stats.cost_micros > 5_000_000) {
    return 'Spending without conversions. Consider pausing, reviewing keywords, or improving the landing page.';
  }
  if (health.grade === 'A') {
    return 'Top performer — consider increasing budget to capture more conversions.';
  }
  if (health.grade === 'B') {
    return 'Performing well. Test new ad copy variants to push CTR higher.';
  }
  if (campaign.stats.ctr < 0.01) {
    return 'Low CTR — ad copy isn\'t resonating. Ask AI to generate new headlines and descriptions.';
  }
  if (health.grade === 'D' || health.grade === 'F') {
    return 'Underperforming. Ask AI to investigate root causes and suggest fixes.';
  }
  return 'Stable performance. Monitor and look for optimization opportunities.';
}

// ============================================================
// Helpers
// ============================================================

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

// ============================================================
// Campaign Card
// ============================================================

function CampaignCard({ campaign, onClick }: { campaign: CampaignWithStats; onClick: () => void }) {
  const health = calculateHealthGrade(campaign);
  const recommendation = getRecommendation(campaign, health);
  const stats = campaign.stats;

  const spendPct = stats?.cost_micros && campaign.budget_amount_micros > 0
    ? Math.min(100, Math.round((stats.cost_micros / (campaign.budget_amount_micros * 30)) * 100))
    : 0;

  return (
    <div
      onClick={onClick}
      className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white truncate">{campaign.name}</h3>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${campaign.status === 'active' ? 'bg-green-600/20 text-green-400' : campaign.status === 'paused' ? 'bg-yellow-600/20 text-yellow-400' : 'bg-gray-700 text-gray-400'}`}>
              {campaign.status}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{campaign.campaign_type} &middot; {fmt(campaign.budget_amount_micros)}/day &middot; {campaign.ad_groups_count} ad groups</p>
        </div>

        {/* Health Grade */}
        <div className={`w-10 h-10 rounded-lg ${health.bgColor} flex items-center justify-center shrink-0`}>
          <span className="text-white font-bold text-lg">{health.grade}</span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-gray-500">Impressions</p>
          <p className="text-sm font-semibold">{stats?.impressions?.toLocaleString() || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Clicks</p>
          <p className="text-sm font-semibold">{stats?.clicks?.toLocaleString() || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">CTR</p>
          <p className="text-sm font-semibold">{stats ? `${((stats.ctr || 0) * 100).toFixed(1)}%` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Conv.</p>
          <p className="text-sm font-semibold">{stats?.conversions || '—'}</p>
        </div>
      </div>

      {/* Spend bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Spend: {stats ? fmt(stats.cost_micros) : '$0'}</span>
          <span>Budget utilization: {spendPct}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full">
          <div
            className={`h-1.5 rounded-full ${spendPct > 90 ? 'bg-red-500' : spendPct > 60 ? 'bg-blue-500' : 'bg-gray-600'}`}
            style={{ width: `${spendPct}%` }}
          />
        </div>
      </div>

      {/* AI Recommendation */}
      <div className="flex items-start gap-2 p-2.5 bg-gray-800/50 rounded-lg">
        <Zap className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-400 leading-relaxed">{recommendation}</p>
      </div>

      {/* Hover action */}
      <div className="flex items-center gap-1 mt-3 text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
        <MessageSquare className="w-3 h-3" />
        Click to analyze in AI Chat
        <ArrowRight className="w-3 h-3" />
      </div>
    </div>
  );
}

// ============================================================
// Main Portfolio Page
// ============================================================

export default function PortfolioPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>('all');
  const [sortBy, setSortBy] = useState<'health' | 'spend' | 'conversions' | 'name'>('health');

  useEffect(() => { fetchCampaigns(); }, []);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns?status=all');
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch { setCampaigns([]); }
    setLoading(false);
  }

  // Filter
  const filtered = campaigns.filter((c) => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'health': return calculateHealthGrade(b).score - calculateHealthGrade(a).score;
      case 'spend': return (b.stats?.cost_micros || 0) - (a.stats?.cost_micros || 0);
      case 'conversions': return (b.stats?.conversions || 0) - (a.stats?.conversions || 0);
      case 'name': return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  // Portfolio metrics
  const portfolioMetrics: PortfolioMetrics = {
    total_spend: campaigns.reduce((s, c) => s + (c.stats?.cost_micros || 0), 0),
    total_conversions: campaigns.reduce((s, c) => s + (c.stats?.conversions || 0), 0),
    total_clicks: campaigns.reduce((s, c) => s + (c.stats?.clicks || 0), 0),
    total_impressions: campaigns.reduce((s, c) => s + (c.stats?.impressions || 0), 0),
    avg_cpa: null,
    avg_ctr: 0,
    campaign_count: campaigns.length,
    active_count: campaigns.filter((c) => c.status === 'active').length,
  };
  if (portfolioMetrics.total_conversions > 0) {
    portfolioMetrics.avg_cpa = portfolioMetrics.total_spend / portfolioMetrics.total_conversions;
  }
  if (portfolioMetrics.total_impressions > 0) {
    portfolioMetrics.avg_ctr = portfolioMetrics.total_clicks / portfolioMetrics.total_impressions;
  }

  const overallGrade = getOverallGrade(campaigns);

  // Budget flow — where money goes
  const spendByCampaign = campaigns
    .filter((c) => c.stats && c.stats.cost_micros > 0)
    .sort((a, b) => (b.stats?.cost_micros || 0) - (a.stats?.cost_micros || 0));

  const wastedSpend = campaigns
    .filter((c) => c.stats && c.stats.cost_micros > 0 && c.stats.conversions === 0)
    .reduce((s, c) => s + (c.stats?.cost_micros || 0), 0);

  function handleCampaignClick(campaign: CampaignWithStats) {
    // Navigate to chat with a pre-filled analysis request
    const message = encodeURIComponent(`Analyze the campaign "${campaign.name}" — what's working, what's not, and what should I change?`);
    router.push(`/chat?prefill=${message}`);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PieChart className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Portfolio</h1>
            <p className="text-sm text-gray-500">Campaign health, budget flow, and AI recommendations</p>
          </div>
        </div>
        <button onClick={fetchCampaigns} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {/* Overall Health */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4">
          <div className={`w-16 h-16 rounded-xl ${overallGrade.bgColor} flex items-center justify-center`}>
            <span className="text-white font-bold text-3xl">{overallGrade.grade}</span>
          </div>
          <div>
            <p className="text-sm text-gray-400">Portfolio Health</p>
            <p className="text-lg font-bold">{overallGrade.score}/100</p>
            <p className="text-xs text-gray-500">{portfolioMetrics.active_count} active of {portfolioMetrics.campaign_count}</p>
          </div>
        </div>

        {/* Total Spend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Spend (30d)</p>
          <p className="text-2xl font-bold">{fmt(portfolioMetrics.total_spend)}</p>
          {wastedSpend > 0 && (
            <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />
              {fmt(wastedSpend)} wasted (no conversions)
            </p>
          )}
        </div>

        {/* Total Conversions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Conversions</p>
          <p className="text-2xl font-bold">{portfolioMetrics.total_conversions.toFixed(1)}</p>
          <p className="text-xs text-gray-500">
            CPA: {portfolioMetrics.avg_cpa ? fmt(portfolioMetrics.avg_cpa) : '—'}
          </p>
        </div>

        {/* Avg CTR */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Avg CTR</p>
          <p className="text-2xl font-bold">{(portfolioMetrics.avg_ctr * 100).toFixed(2)}%</p>
          <p className="text-xs text-gray-500">
            {portfolioMetrics.total_clicks.toLocaleString()} clicks / {portfolioMetrics.total_impressions.toLocaleString()} impr.
          </p>
        </div>
      </div>

      {/* Budget Flow */}
      {spendByCampaign.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Budget Flow — Where Your Money Goes</h2>
          <div className="space-y-2">
            {spendByCampaign.map((c) => {
              const pct = portfolioMetrics.total_spend > 0
                ? (c.stats!.cost_micros / portfolioMetrics.total_spend) * 100
                : 0;
              const hasConversions = (c.stats?.conversions || 0) > 0;

              return (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-40 truncate">{c.name}</span>
                  <div className="flex-1 h-5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-5 rounded-full flex items-center px-2 ${hasConversions ? 'bg-blue-600/60' : 'bg-red-600/40'}`}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    >
                      <span className="text-[10px] text-white font-medium whitespace-nowrap">
                        {fmt(c.stats!.cost_micros)} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <span className="text-xs w-16 text-right">{c.stats?.conversions || 0} conv.</span>
                  {!hasConversions && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" title="No conversions" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters + Sort */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'active', 'paused', 'draft'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${filter === f ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {f} {f === 'all' ? `(${campaigns.length})` : `(${campaigns.filter((c) => c.status === f).length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Sort:</span>
          {(['health', 'spend', 'conversions', 'name'] as const).map((s) => (
            <button key={s} onClick={() => setSortBy(s)} className={`px-2 py-1 rounded capitalize ${sortBy === s ? 'bg-gray-800 text-white' : 'hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign Cards */}
      {loading ? (
        <div className="text-gray-500 text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading portfolio...</div>
      ) : sorted.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} onClick={() => handleCampaignClick(campaign)} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <PieChart className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No campaigns yet</h2>
          <p className="text-gray-500 text-sm mb-4">Tell the AI to create your first campaign.</p>
          <Link href="/chat" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
            <MessageSquare className="w-4 h-4" /> Open AI Chat
          </Link>
        </div>
      )}
    </div>
  );
}
