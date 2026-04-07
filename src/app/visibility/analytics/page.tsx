'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Loader2, Globe, Smartphone, Monitor, Target } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type ReportType = 'overview' | 'landing_pages' | 'ad_traffic' | 'conversions' | 'devices';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>('overview');
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  // Auto-load overview on mount
  useEffect(() => { fetchReport('overview'); }, []);

  async function fetchReport(type: ReportType) {
    setLoading(true);
    setActiveTab(type);
    try {
      // Call the tool via a simple API proxy
      const res = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: type, days }),
      });
      const result = await res.json();
      setData(result.result || result.error || 'No data available');
    } catch {
      setData('Failed to load analytics. Check GA4 connection in Settings.');
    }
    setLoading(false);
  }

  const tabs: Array<{ id: ReportType; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'landing_pages', label: 'Landing Pages', icon: Globe },
    { id: 'ad_traffic', label: 'Ad Traffic', icon: Target },
    { id: 'conversions', label: 'Conversions', icon: Target },
    { id: 'devices', label: 'Devices', icon: Smartphone },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/visibility" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <BarChart3 className="w-6 h-6 text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold">Website Analytics</h1>
          <p className="text-sm text-gray-500">Traffic, landing pages, conversions, ad click behavior</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => fetchReport(tab.id)} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${activeTab === tab.id ? 'bg-purple-600/20 text-purple-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Period:</span>
          {[7, 14, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-2 py-1 text-xs rounded ${days === d ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        {loading ? (
          <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading analytics...</div>
        ) : data ? (
          <div className="prose prose-invert prose-sm max-w-none [&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:py-2 [&_th]:px-3 [&_th]:text-gray-400 [&_th]:border-b [&_th]:border-gray-700 [&_td]:py-2 [&_td]:px-3 [&_td]:border-b [&_td]:border-gray-800/50 [&_td]:text-gray-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-4 [&_strong]:text-yellow-400">
            <ReactMarkdown>{data}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-center py-12">
            <BarChart3 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-2">Select a report type to view analytics</p>
            <p className="text-gray-600 text-xs">Data comes from Google Analytics 4. Set your GA4 Property ID in Settings.</p>
          </div>
        )}
      </div>
    </div>
  );
}
