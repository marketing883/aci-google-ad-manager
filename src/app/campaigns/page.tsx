'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Megaphone, Plus, Trash2 } from 'lucide-react';

interface CampaignRow {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_amount_micros: number;
  stats?: { clicks: number; cost_micros: number; conversions: number; ctr: number; impressions: number };
  ad_groups_count?: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-600',
  pending_approval: 'bg-orange-500',
  approved: 'bg-blue-500',
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  ended: 'bg-gray-500',
};

function formatMicros(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchCampaigns();
  }, [filter]);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns?status=${filter}`);
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      setCampaigns([]);
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Campaigns</h1>
        </div>
        <Link href="/campaigns/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {['all', 'active', 'draft', 'paused', 'ended'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors capitalize ${
              filter === tab ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading campaigns...</div>
      ) : campaigns.length > 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Campaign</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Budget</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Impr.</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Clicks</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">CTR</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Spend</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Conv.</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${c.id}`} className="text-blue-400 hover:text-blue-300 font-medium">{c.name}</Link>
                    <p className="text-xs text-gray-500">{c.campaign_type} &middot; {c.ad_groups_count || 0} ad groups</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-600'} text-white`}>
                      {c.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 text-sm">{formatMicros(c.budget_amount_micros)}/day</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.impressions?.toLocaleString() || '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.clicks?.toLocaleString() || '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.ctr ? `${(c.stats.ctr * 100).toFixed(1)}%` : '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.cost_micros ? formatMicros(c.stats.cost_micros) : '—'}</td>
                  <td className="text-right px-4 py-3 text-sm">{c.stats?.conversions || '—'}</td>
                  <td className="px-2 py-3">
                    <button onClick={async (e) => { e.preventDefault(); if (confirm(`Delete "${c.name}"?`)) { await fetch('/api/entities/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_type: 'campaign', entity_id: c.id }) }); fetchCampaigns(); } }} className="p-1.5 hover:bg-red-600/20 rounded text-gray-600 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Megaphone className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No campaigns yet</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
            Create your first campaign manually or use AI Chat to describe what you want.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/campaigns/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">Create Manually</Link>
            <Link href="/chat" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors">Use AI Chat</Link>
          </div>
        </div>
      )}
    </div>
  );
}
