'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface DashboardData {
  metrics: {
    total_spend_micros: number;
    total_clicks: number;
    total_impressions: number;
    total_conversions: number;
    avg_ctr: number;
    avg_cpc_micros: number;
    avg_cpa_micros: number | null;
    active_campaigns: number;
    pending_approvals: number;
  };
  daily: Array<{ date: string; spend: number; clicks: number; impressions: number; conversions: number }>;
}

function formatMicros(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<Array<{ id: string; action_type: string; entity_type: string; created_at: string }>>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string; stats?: { clicks: number; cost_micros: number; conversions: number; ctr: number } }>>([]);

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function fetchDashboard() {
    setLoading(true);
    try {
      const [dashRes, appRes, campRes] = await Promise.all([
        fetch('/api/performance/dashboard?days=30'),
        fetch('/api/approvals?status=pending&limit=5'),
        fetch('/api/campaigns?status=active'),
      ]);

      const [dashData, appData, campData] = await Promise.all([
        dashRes.json(),
        appRes.json(),
        campRes.json(),
      ]);

      setData(dashData);
      setApprovals(Array.isArray(appData) ? appData : []);
      setCampaigns(Array.isArray(campData) ? campData : []);
    } catch (error) {
      console.error('Dashboard fetch failed:', error);
    }
    setLoading(false);
  }

  const m = data?.metrics;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <button onClick={fetchDashboard} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Spend', value: m ? formatMicros(m.total_spend_micros) : '$0.00' },
          { label: 'Clicks', value: m ? m.total_clicks.toLocaleString() : '0' },
          { label: 'Conversions', value: m ? m.total_conversions.toFixed(1) : '0' },
          { label: 'Avg. CPA', value: m?.avg_cpa_micros ? formatMicros(m.avg_cpa_micros) : '—' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-sm text-gray-400 mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend Chart */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Daily Spend (30 days)</h2>
          {data?.daily && data.daily.length > 0 ? (
            <div className="h-64 flex items-end gap-1">
              {data.daily.map((day) => {
                const maxSpend = Math.max(...data.daily.map((d) => d.spend)) || 1;
                const height = (day.spend / maxSpend) * 100;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center justify-end" title={`${day.date}: ${formatMicros(day.spend)}`}>
                    <div className="w-full bg-blue-500 rounded-t" style={{ height: `${Math.max(height, 2)}%` }} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-600">
              {loading ? 'Loading...' : 'Connect Google Ads and sync to see spend data'}
            </div>
          )}
        </div>

        {/* Pending Approvals */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Pending Approvals</h2>
            {approvals.length > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {approvals.length}
              </span>
            )}
          </div>
          {approvals.length > 0 ? (
            <div className="space-y-2">
              {approvals.map((a) => (
                <Link key={a.id} href={`/approvals/${a.id}`} className="block p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                  <p className="text-sm font-medium">{a.action_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">{a.entity_type} &bull; {new Date(a.created_at).toLocaleDateString()}</p>
                </Link>
              ))}
              <Link href="/approvals" className="text-sm text-blue-400 hover:text-blue-300 block text-center mt-2">View all</Link>
            </div>
          ) : (
            <p className="text-gray-600 text-sm">No pending approvals</p>
          )}
        </div>
      </div>

      {/* Active Campaigns */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Active Campaigns</h2>
        {campaigns.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-2 text-sm font-medium text-gray-400">Campaign</th>
                <th className="text-right px-4 py-2 text-sm font-medium text-gray-400">Clicks</th>
                <th className="text-right px-4 py-2 text-sm font-medium text-gray-400">Spend</th>
                <th className="text-right px-4 py-2 text-sm font-medium text-gray-400">Conv.</th>
                <th className="text-right px-4 py-2 text-sm font-medium text-gray-400">CTR</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${c.id}`} className="text-blue-400 hover:text-blue-300">{c.name}</Link>
                  </td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.clicks?.toLocaleString() || '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.cost_micros ? formatMicros(c.stats.cost_micros) : '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.conversions || '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.ctr ? `${(c.stats.ctr * 100).toFixed(2)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-600 text-sm">{loading ? 'Loading...' : 'No active campaigns yet.'}</p>
        )}
      </div>
    </div>
  );
}
