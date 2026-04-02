'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Zap, TrendingUp, TrendingDown, DollarSign, MousePointerClick,
  Target, BarChart3, AlertTriangle, CheckCircle, Clock,
  ArrowRight, RefreshCw, Loader2, MessageSquare, Sparkles,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface DashboardMetrics {
  total_spend_micros: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  avg_ctr: number;
  avg_cpc_micros: number;
  avg_cpa_micros: number | null;
  active_campaigns: number;
  pending_approvals: number;
}

interface DailyData {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

interface ApprovalItem {
  id: string;
  action_type: string;
  entity_type: string;
  ai_reasoning: string | null;
  priority: string;
  created_at: string;
}

interface AgentLog {
  id: string;
  agent_name: string;
  action: string;
  status: string;
  created_at: string;
  output_summary: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  budget_amount_micros: number;
  campaign_type: string;
  stats?: { clicks: number; cost_micros: number; conversions: number; impressions: number; ctr: number };
}

// ============================================================
// Helpers
// ============================================================

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function pctChange(current: number, previous: number): { value: string; positive: boolean } | null {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return { value: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`, positive: change >= 0 };
}

// ============================================================
// Metric Card
// ============================================================

function MetricCard({ label, value, icon: Icon, trend, subtitle }: {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: { value: string; positive: boolean } | null;
  subtitle?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-gray-600" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
            {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Alert Card
// ============================================================

function AlertCard({ type, title, description, action, actionLabel, actionHref }: {
  type: 'warning' | 'info' | 'success' | 'action';
  title: string;
  description: string;
  action?: () => void;
  actionLabel?: string;
  actionHref?: string;
}) {
  const colors = {
    warning: 'border-orange-800/50 bg-orange-900/10',
    info: 'border-blue-800/50 bg-blue-900/10',
    success: 'border-green-800/50 bg-green-900/10',
    action: 'border-purple-800/50 bg-purple-900/10',
  };
  const icons = {
    warning: <AlertTriangle className="w-4 h-4 text-orange-400" />,
    info: <BarChart3 className="w-4 h-4 text-blue-400" />,
    success: <CheckCircle className="w-4 h-4 text-green-400" />,
    action: <Sparkles className="w-4 h-4 text-purple-400" />,
  };

  return (
    <div className={`border rounded-xl p-4 ${colors[type]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icons[type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
          {(action || actionHref) && (
            actionHref ? (
              <Link href={actionHref} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 font-medium">
                {actionLabel || 'Take action'} <ArrowRight className="w-3 h-3" />
              </Link>
            ) : (
              <button onClick={action} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 font-medium">
                {actionLabel || 'Take action'} <ArrowRight className="w-3 h-3" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Briefing Page
// ============================================================

export default function BriefingPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [recentLogs, setRecentLogs] = useState<AgentLog[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [dashRes, appRes, logsRes, campRes] = await Promise.all([
        fetch('/api/performance/dashboard?days=30').then((r) => r.json()),
        fetch('/api/approvals?status=pending&limit=10').then((r) => r.json()),
        fetch('/api/logs?limit=5').then((r) => r.json()),
        fetch('/api/campaigns?status=all').then((r) => r.json()),
      ]);

      setMetrics(dashRes.metrics || null);
      setDaily(dashRes.daily || []);
      setApprovals(Array.isArray(appRes) ? appRes : []);
      setRecentLogs(Array.isArray(logsRes) ? logsRes : []);
      setCampaigns(Array.isArray(campRes) ? campRes : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  // Generate alerts from data
  const alerts: Array<{ type: 'warning' | 'info' | 'success' | 'action'; title: string; description: string; actionLabel?: string; actionHref?: string }> = [];

  if (approvals.length > 0) {
    alerts.push({
      type: 'action',
      title: `${approvals.length} pending approval${approvals.length > 1 ? 's' : ''}`,
      description: 'AI actions waiting for your review before going live.',
      actionLabel: 'Review approvals',
      actionHref: '/approvals',
    });
  }

  if (metrics && metrics.active_campaigns === 0) {
    alerts.push({
      type: 'info',
      title: 'No active campaigns',
      description: 'Get started by telling the AI what you want to advertise.',
      actionLabel: 'Open AI Chat',
      actionHref: '/chat',
    });
  }

  // Check for campaigns with spend but no conversions
  const wastefulCampaigns = campaigns.filter((c) => c.stats && c.stats.cost_micros > 10_000_000 && c.stats.conversions === 0);
  if (wastefulCampaigns.length > 0) {
    alerts.push({
      type: 'warning',
      title: `${wastefulCampaigns.length} campaign${wastefulCampaigns.length > 1 ? 's' : ''} spending without conversions`,
      description: `${wastefulCampaigns.map((c) => `"${c.name}" (${fmt(c.stats!.cost_micros)})`).join(', ')} — consider pausing or optimizing.`,
      actionLabel: 'Ask AI to investigate',
      actionHref: '/chat',
    });
  }

  // Check for campaigns hitting budget limits
  const budgetLimitedCampaigns = campaigns.filter((c) => c.stats && c.stats.impressions > 0 && c.status === 'active');
  if (budgetLimitedCampaigns.length > 0 && metrics && metrics.total_conversions > 0) {
    const bestCampaign = budgetLimitedCampaigns.sort((a, b) => (b.stats?.conversions || 0) - (a.stats?.conversions || 0))[0];
    if (bestCampaign?.stats?.conversions && bestCampaign.stats.conversions > 0) {
      alerts.push({
        type: 'success',
        title: `"${bestCampaign.name}" is your top converter`,
        description: `${bestCampaign.stats.conversions} conversions at ${fmt(Math.round(bestCampaign.stats.cost_micros / bestCampaign.stats.conversions))} CPA. Consider increasing its budget.`,
        actionLabel: 'Ask AI to optimize',
        actionHref: '/chat',
      });
    }
  }

  if (alerts.length === 0 && !loading) {
    alerts.push({
      type: 'info',
      title: 'All systems operational',
      description: 'No alerts right now. Sync your Google Ads data or ask the AI to run an analysis.',
      actionLabel: 'Open AI Chat',
      actionHref: '/chat',
    });
  }

  // Calculate week-over-week trends
  const midpoint = Math.floor(daily.length / 2);
  const recentHalf = daily.slice(midpoint);
  const olderHalf = daily.slice(0, midpoint);
  const recentSpend = recentHalf.reduce((s, d) => s + d.spend, 0);
  const olderSpend = olderHalf.reduce((s, d) => s + d.spend, 0);
  const recentClicks = recentHalf.reduce((s, d) => s + d.clicks, 0);
  const olderClicks = olderHalf.reduce((s, d) => s + d.clicks, 0);
  const recentConv = recentHalf.reduce((s, d) => s + d.conversions, 0);
  const olderConv = olderHalf.reduce((s, d) => s + d.conversions, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="w-7 h-7 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h1>
            <p className="text-sm text-gray-500">Here's your Google Ads briefing — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
        <button onClick={fetchAll} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <MetricCard
          label="Spend"
          value={metrics ? fmt(metrics.total_spend_micros) : '$0'}
          icon={DollarSign}
          trend={pctChange(recentSpend, olderSpend)}
          subtitle="Last 30 days"
        />
        <MetricCard
          label="Clicks"
          value={metrics ? metrics.total_clicks.toLocaleString() : '0'}
          icon={MousePointerClick}
          trend={pctChange(recentClicks, olderClicks)}
        />
        <MetricCard
          label="CTR"
          value={metrics ? `${(metrics.avg_ctr * 100).toFixed(2)}%` : '0%'}
          icon={Target}
        />
        <MetricCard
          label="Conversions"
          value={metrics ? metrics.total_conversions.toFixed(1) : '0'}
          icon={TrendingUp}
          trend={pctChange(recentConv, olderConv)}
        />
        <MetricCard
          label="CPA"
          value={metrics?.avg_cpa_micros ? fmt(metrics.avg_cpa_micros) : '—'}
          icon={BarChart3}
        />
        <MetricCard
          label="Active"
          value={metrics ? `${metrics.active_campaigns} campaigns` : '0'}
          icon={Zap}
          subtitle={metrics?.pending_approvals ? `${metrics.pending_approvals} pending` : undefined}
        />
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Alerts + Actions */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Alerts & Recommendations</h2>

          {loading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-600">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading your briefing...
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert, i) => (
                <AlertCard key={i} {...alert} />
              ))}
            </div>
          )}

          {/* Spend Chart */}
          {daily.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mt-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Daily Spend (30 days)</h3>
              <div className="h-32 flex items-end gap-0.5">
                {daily.map((day) => {
                  const max = Math.max(...daily.map((d) => d.spend)) || 1;
                  const height = Math.max((day.spend / max) * 100, 2);
                  return (
                    <div key={day.date} className="flex-1 group relative">
                      <div
                        className="w-full bg-blue-500/80 hover:bg-blue-400 rounded-t transition-colors cursor-default"
                        style={{ height: `${height}%` }}
                        title={`${day.date}: ${fmt(day.spend)} | ${day.clicks} clicks | ${day.conversions} conv.`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-gray-600">
                <span>{daily[0]?.date}</span>
                <span>{daily[daily.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Quick Actions + Recent Activity */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Quick Actions</h2>
          <div className="space-y-2">
            <Link href="/chat" className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-blue-600/30 hover:bg-blue-900/10 transition-colors">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-sm font-medium">Create a campaign</p>
                <p className="text-xs text-gray-500">Tell the AI what to advertise</p>
              </div>
            </Link>
            <Link href="/chat" className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-purple-600/30 hover:bg-purple-900/10 transition-colors">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <div>
                <p className="text-sm font-medium">Run optimization</p>
                <p className="text-xs text-gray-500">Ask AI to find wasted spend</p>
              </div>
            </Link>
            <Link href="/chat" className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-green-600/30 hover:bg-green-900/10 transition-colors">
              <Target className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-sm font-medium">Competitor intel</p>
                <p className="text-xs text-gray-500">Analyze what competitors are doing</p>
              </div>
            </Link>
          </div>

          {/* Recent AI Activity */}
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-6">Recent AI Activity</h2>
          {recentLogs.length > 0 ? (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="p-3 bg-gray-900 border border-gray-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-300">{log.agent_name}</span>
                    <span className="text-[10px] text-gray-600">{timeAgo(log.created_at)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{log.action}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${log.status === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600 p-3 bg-gray-900 border border-gray-800 rounded-lg">
              No recent AI activity. Use the chat to get started.
            </p>
          )}

          {/* Pending Approvals */}
          {approvals.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-6">Pending Approvals</h2>
              <div className="space-y-2">
                {approvals.slice(0, 3).map((a) => (
                  <Link key={a.id} href={`/approvals/${a.id}`} className="block p-3 bg-gray-900 border border-gray-800 rounded-lg hover:border-orange-600/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{a.action_type.replace(/_/g, ' ')}</span>
                      <Clock className="w-3 h-3 text-orange-400" />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">{timeAgo(a.created_at)}</p>
                  </Link>
                ))}
                {approvals.length > 3 && (
                  <Link href="/approvals" className="block text-xs text-blue-400 text-center hover:text-blue-300">
                    +{approvals.length - 3} more →
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
