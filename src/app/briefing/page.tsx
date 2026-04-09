'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Zap, RefreshCw, Loader2, ChevronDown, ChevronUp,
  AlertCircle, AlertTriangle, Info, CheckCircle,
  DollarSign, Target, BarChart3, MessageSquare,
} from 'lucide-react';
import { useChatPanel } from '@/components/layout/ChatPanelContext';
import type { FeedItem, IntelligenceFeedResponse } from '@/types/intelligence';

// ============================================================
// Helpers
// ============================================================

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500', stripe: 'bg-red-500', badge: 'bg-red-600/20 text-red-400' },
  warning: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500', stripe: 'bg-orange-500', badge: 'bg-orange-600/20 text-orange-400' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500', stripe: 'bg-blue-500', badge: 'bg-blue-600/20 text-blue-400' },
  success: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500', stripe: 'bg-green-500', badge: 'bg-green-600/20 text-green-400' },
};

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  google_ads: { label: 'Ads', color: 'bg-blue-600/20 text-blue-400' },
  ga4: { label: 'Analytics', color: 'bg-purple-600/20 text-purple-400' },
  serp: { label: 'Search', color: 'bg-green-600/20 text-green-400' },
  llm: { label: 'AI', color: 'bg-yellow-600/20 text-yellow-400' },
  system: { label: 'System', color: 'bg-gray-600/20 text-gray-400' },
};

// ============================================================
// Feed Card
// ============================================================

function FeedCard({ item }: { item: FeedItem }) {
  const { openChat } = useChatPanel();
  const config = SEVERITY_CONFIG[item.severity];
  const Icon = config.icon;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors group">
      <div className="flex">
        {/* Severity stripe */}
        <div className={`w-1 shrink-0 ${config.stripe}`} />

        <div className="flex-1 p-4">
          {/* Header: severity icon + title + time */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-start gap-2 flex-1">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
              <h3 className="text-sm font-semibold text-white leading-tight">{item.title}</h3>
            </div>
            <span className="text-[10px] text-gray-600 shrink-0 ml-2">{timeAgo(item.timestamp)}</span>
          </div>

          {/* Story */}
          <p className="text-xs text-gray-400 leading-relaxed mb-3 ml-6">{item.story}</p>

          {/* Source badges + actions */}
          <div className="flex items-center justify-between ml-6">
            <div className="flex gap-1.5">
              {item.dataSources.map((src) => {
                const badge = SOURCE_BADGES[src];
                return badge ? (
                  <span key={src} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                ) : null;
              })}
            </div>

            <div className="flex gap-2">
              {item.actions.map((action, i) => (
                action.type === 'chat' ? (
                  <button
                    key={i}
                    onClick={() => openChat(undefined, action.chatPrefill)}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 rounded-lg transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" /> {action.label}
                  </button>
                ) : (
                  <Link
                    key={i}
                    href={action.href || '#'}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    {action.label}
                  </Link>
                )
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Intelligence Feed Page
// ============================================================

export default function BriefingPage() {
  const [feed, setFeed] = useState<IntelligenceFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsExpanded, setStatsExpanded] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('briefing-stats-expanded') === 'true';
    return false;
  });

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/intelligence');
      const data = await res.json();
      if (data.items) setFeed(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchFeed, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  function toggleStats() {
    const next = !statsExpanded;
    setStatsExpanded(next);
    localStorage.setItem('briefing-stats-expanded', String(next));
  }

  const stats = feed?.stats;
  const criticalCount = feed?.items.filter((i) => i.severity === 'critical').length || 0;
  const warningCount = feed?.items.filter((i) => i.severity === 'warning').length || 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="w-7 h-7 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Intelligence</h1>
            <p className="text-sm text-gray-500">
              {criticalCount > 0 ? `${criticalCount} critical` : ''}
              {criticalCount > 0 && warningCount > 0 ? ', ' : ''}
              {warningCount > 0 ? `${warningCount} warnings` : ''}
              {criticalCount === 0 && warningCount === 0 ? 'All systems operational' : ''}
              {feed ? ` · ${feed.items.length} insights` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {feed && (
            <span className="text-[10px] text-gray-600">Updated {timeAgo(feed.generatedAt)}</span>
          )}
          <button onClick={fetchFeed} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
        </div>
      </div>

      {/* Compact Stats Bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
        <button onClick={toggleStats} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">Spend:</span>
              <span className="font-semibold text-white">{stats ? fmt(stats.spend_micros) : '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">Conv:</span>
              <span className="font-semibold text-white">{stats?.conversions ?? '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">CPA:</span>
              <span className="font-semibold text-white">{stats?.cpa_micros ? fmt(stats.cpa_micros) : '—'}</span>
            </div>
          </div>
          {statsExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {/* Expanded stats grid */}
        {statsExpanded && stats && (
          <div className="grid grid-cols-5 gap-4 px-5 pb-4 pt-1 border-t border-gray-800">
            <div><p className="text-[10px] text-gray-500">Total Spend (30d)</p><p className="text-lg font-bold">{fmt(stats.spend_micros)}</p></div>
            <div><p className="text-[10px] text-gray-500">Conversions</p><p className="text-lg font-bold">{stats.conversions}</p></div>
            <div><p className="text-[10px] text-gray-500">CPA</p><p className="text-lg font-bold">{stats.cpa_micros ? fmt(stats.cpa_micros) : '—'}</p></div>
            <div><p className="text-[10px] text-gray-500">Clicks</p><p className="text-lg font-bold">{stats.clicks.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-gray-500">Impressions</p><p className="text-lg font-bold">{stats.impressions.toLocaleString()}</p></div>
          </div>
        )}
      </div>

      {/* Feed */}
      {loading && !feed ? (
        <div className="text-center py-16 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
          <p className="text-sm">Analyzing your data...</p>
        </div>
      ) : feed && feed.items.length > 0 ? (
        <div className="space-y-3">
          {feed.items.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">All quiet</h2>
          <p className="text-gray-500 text-sm">No issues detected. Your campaigns are running smoothly.</p>
        </div>
      )}
    </div>
  );
}
