'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye, Search, BarChart3, TrendingUp, TrendingDown, Minus,
  Loader2, RefreshCw, ArrowRight, MessageSquare, Globe, Bot,
  DollarSign, Monitor,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface VisibilityReport {
  id: string;
  brand_name: string;
  domain: string;
  overall_score: number;
  organic_score: number;
  ai_overview_score: number;
  llm_score: number;
  paid_score: number;
  target_keywords: string[];
  recommendations: Array<{ id: string; title: string; action: string; priority: number }>;
  api_cost_cents: number;
  created_at: string;
}

interface AnalyticsSnapshot {
  id: string;
  period_start: string;
  period_end: string;
  traffic: { sessions?: number; users?: number; bounce_rate?: number };
  scores: { website_health?: number };
  flags: Array<{ type: string }>;
  recommendations: Array<{ id: string; title: string; action: string; priority: number }>;
  created_at: string;
}

// ============================================================
// Score Card Component
// ============================================================

function ScoreCard({ title, score, icon: Icon, trend, subtitle, href }: {
  title: string;
  score: number | null;
  icon: React.ElementType;
  trend?: number | null;
  subtitle: string;
  href: string;
}) {
  const scoreColor = score === null ? 'text-gray-500'
    : score >= 70 ? 'text-green-400'
    : score >= 40 ? 'text-yellow-400'
    : 'text-red-400';

  const scoreBg = score === null ? 'bg-gray-800'
    : score >= 70 ? 'bg-green-600/10 border-green-600/20'
    : score >= 40 ? 'bg-yellow-600/10 border-yellow-600/20'
    : 'bg-red-600/10 border-red-600/20';

  return (
    <Link href={href} className={`${scoreBg} border border-gray-800 rounded-xl p-5 hover:border-gray-600 transition-colors block`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400">{title}</span>
        </div>
        {trend !== undefined && trend !== null && (
          <div className={`flex items-center gap-1 text-xs ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-500'}`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {trend !== 0 ? `${Math.abs(trend)}` : ''}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold ${scoreColor}`}>{score ?? '—'}</span>
        <span className="text-sm text-gray-500">/100</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
    </Link>
  );
}

// ============================================================
// Main Dashboard
// ============================================================

export default function VisibilityDashboard() {
  const router = useRouter();
  const [latestReport, setLatestReport] = useState<VisibilityReport | null>(null);
  const [reports, setReports] = useState<VisibilityReport[]>([]);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, snapshotRes] = await Promise.all([
        fetch('/api/visibility').then((r) => r.json()).catch(() => []),
        fetch('/api/analytics/snapshot').then((r) => r.json()).catch(() => null),
      ]);
      if (Array.isArray(reportsRes) && reportsRes.length > 0) {
        setReports(reportsRes);
        setLatestReport(reportsRes[0]);
      }
      if (snapshotRes && !snapshotRes.empty) {
        setSnapshot(snapshotRes);
      } else {
        // No snapshot exists — trigger first one automatically
        try {
          await fetch('/api/cron/analytics-snapshot', { method: 'POST' });
          // Re-fetch the snapshot
          const freshSnapshot = await fetch('/api/analytics/snapshot').then((r) => r.json()).catch(() => null);
          if (freshSnapshot && !freshSnapshot.empty) {
            setSnapshot(freshSnapshot);
          }
        } catch { /* cron may not be available */ }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculate trend from previous report
  const prevReport = reports.length > 1 ? reports[1] : null;
  const overallTrend = latestReport && prevReport ? latestReport.overall_score - prevReport.overall_score : null;
  const websiteScore = (snapshot?.scores as Record<string, unknown>)?.website_health as number | null ?? null;
  const trafficData = snapshot?.traffic as { sessions?: number; users?: number; bounce_rate?: number } | null;
  const snapshotFlags = (snapshot?.flags as Array<{ type: string }>) || [];
  const snapshotRecs = (snapshot?.recommendations as Array<{ id: string; title: string; action: string; priority: number }>) || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Eye className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Visibility & Intelligence</h1>
            <p className="text-sm text-gray-500">Brand visibility, website analytics, and actionable insights</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <Link href="/visibility/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            <Search className="w-4 h-4" /> New Report
          </Link>
        </div>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <ScoreCard
          title="Brand Visibility"
          score={latestReport?.overall_score ?? null}
          icon={Eye}
          trend={overallTrend}
          subtitle={latestReport ? `${latestReport.target_keywords.length} keywords tracked` : 'Run your first report'}
          href="/visibility/search"
        />
        <ScoreCard
          title="Organic Search"
          score={latestReport?.organic_score ?? null}
          icon={Globe}
          trend={prevReport ? (latestReport?.organic_score ?? 0) - prevReport.organic_score : null}
          subtitle="Google rankings"
          href="/visibility/search"
        />
        <ScoreCard
          title="AI Visibility"
          score={latestReport?.ai_overview_score ?? null}
          icon={Bot}
          trend={prevReport ? (latestReport?.ai_overview_score ?? 0) - prevReport.ai_overview_score : null}
          subtitle="AI Overviews + ChatGPT"
          href="/visibility/search"
        />
        <ScoreCard
          title="Paid Search"
          score={latestReport?.paid_score ?? null}
          icon={DollarSign}
          trend={prevReport ? (latestReport?.paid_score ?? 0) - prevReport.paid_score : null}
          subtitle="Ad presence vs competitors"
          href="/visibility/search"
        />
      </div>

      {/* Live Analytics Summary (from daily snapshot) */}
      {snapshot && trafficData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">Website Health</p>
            <p className={`text-2xl font-bold ${websiteScore && websiteScore >= 60 ? 'text-green-400' : websiteScore && websiteScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{websiteScore ?? '—'}/100</p>
            <p className="text-[10px] text-gray-600">{snapshotFlags.length} issues found</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">Sessions (30d)</p>
            <p className="text-2xl font-bold">{trafficData.sessions?.toLocaleString() ?? '—'}</p>
            <p className="text-[10px] text-gray-600">{trafficData.users?.toLocaleString() ?? '—'} users</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">Bounce Rate</p>
            <p className={`text-2xl font-bold ${trafficData.bounce_rate && trafficData.bounce_rate > 0.5 ? 'text-red-400' : 'text-green-400'}`}>{trafficData.bounce_rate ? `${(trafficData.bounce_rate * 100).toFixed(1)}%` : '—'}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">Last Updated</p>
            <p className="text-sm font-medium text-gray-300">{new Date(snapshot.created_at).toLocaleDateString()}</p>
            <p className="text-[10px] text-gray-600">{new Date(snapshot.created_at).toLocaleTimeString()}</p>
          </div>
        </div>
      )}

      {/* Two-column layout: Recommendations + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Recommendations */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Top Recommendations</h2>
          {(() => {
            const allRecs = [...(latestReport?.recommendations || []), ...snapshotRecs];
            // Deduplicate by id
            const seen = new Set<string>();
            const uniqueRecs = allRecs.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
            return uniqueRecs;
          })().length > 0 ? (
            <div className="space-y-3">
              {(() => {
                const allRecs = [...(latestReport?.recommendations || []), ...snapshotRecs];
                const seen = new Set<string>();
                return allRecs.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
              })().slice(0, 5).map((rec, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-800/40 rounded-lg">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    rec.priority === 1 ? 'bg-red-600/20 text-red-400' : rec.priority === 2 ? 'bg-yellow-600/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
                  }`}>{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{rec.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{rec.action}</p>
                  </div>
                  <button
                    onClick={() => {
                      const msg = encodeURIComponent(`${rec.action} Help me implement this.`);
                      router.push(`/chat?prefill=${msg}`);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0"
                  >
                    <MessageSquare className="w-3 h-3" /> Fix
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Search className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Run a visibility report to get recommendations.</p>
              <Link href="/visibility/new" className="text-blue-400 text-sm hover:text-blue-300 mt-2 inline-block">Run First Report</Link>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="space-y-4">
          <Link href="/visibility/search" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors block">
            <div className="flex items-center gap-3 mb-2">
              <Search className="w-5 h-5 text-blue-400" />
              <h3 className="font-medium text-white">Search Visibility</h3>
            </div>
            <p className="text-xs text-gray-500">Organic rankings, AI Overviews, LLM mentions, paid ads</p>
            <div className="flex items-center gap-1 text-xs text-blue-400 mt-2"><ArrowRight className="w-3 h-3" /> View reports</div>
          </Link>

          <Link href="/visibility/analytics" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors block">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <h3 className="font-medium text-white">Website Analytics</h3>
            </div>
            <p className="text-xs text-gray-500">Traffic, landing pages, conversions, ad click behavior</p>
            <div className="flex items-center gap-1 text-xs text-purple-400 mt-2"><ArrowRight className="w-3 h-3" /> View analytics</div>
          </Link>

          <Link href="/visibility/trends" className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors block">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <h3 className="font-medium text-white">Trends</h3>
            </div>
            <p className="text-xs text-gray-500">Score changes over time, improvement tracking</p>
            <div className="flex items-center gap-1 text-xs text-green-400 mt-2"><ArrowRight className="w-3 h-3" /> View trends</div>
          </Link>
        </div>
      </div>

      {/* Recent Reports */}
      {reports.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Recent Reports</h2>
          <div className="space-y-2">
            {reports.slice(0, 5).map((report) => (
              <Link
                key={report.id}
                href={`/visibility/${report.id}`}
                className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                    report.overall_score >= 70 ? 'bg-green-600/20 text-green-400' :
                    report.overall_score >= 40 ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-red-600/20 text-red-400'
                  }`}>{report.overall_score}</div>
                  <div>
                    <p className="text-sm text-white">{report.brand_name} — {report.domain}</p>
                    <p className="text-xs text-gray-500">{report.target_keywords.length} keywords &middot; {new Date(report.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
