'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Loader2, Globe, Smartphone, Monitor, Target, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FeatureNotReady } from '@/components/SetupBanner';

type ReportType = 'overview' | 'landing_pages' | 'ad_traffic' | 'conversions' | 'devices';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>('overview');
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [ga4Ready, setGa4Ready] = useState<boolean | null>(null); // null = checking

  // Check GA4 config before loading data
  useEffect(() => {
    fetch('/api/setup-status')
      .then((r) => r.json())
      .then((s) => {
        const ready = s.ga4?.connected || false;
        setGa4Ready(ready);
        if (ready) fetchReport('overview');
      })
      .catch(() => setGa4Ready(false));
  }, []);

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

      {/* GA4 not configured */}
      {ga4Ready === false && (
        <FeatureNotReady feature="ga4" message="Google Analytics 4 is not connected. Add your GA4 Property ID in Settings to see website analytics, landing page performance, and conversion data." />
      )}

      {ga4Ready === null && (
        <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Checking analytics connection...</div>
      )}

      {/* Controls + Content — only show when GA4 is ready */}
      {ga4Ready && (
        <>
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

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            {loading ? (
              <div className="text-center py-12 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading analytics...</div>
            ) : data ? (
              <div className="prose prose-invert prose-sm max-w-none
                [&_table]:w-full [&_table]:text-sm [&_table]:mb-8
                [&_thead]:bg-gray-800/50
                [&_th]:text-left [&_th]:py-3 [&_th]:px-4 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-gray-400 [&_th]:border-b [&_th]:border-gray-700 [&_th]:font-semibold
                [&_td]:py-3 [&_td]:px-4 [&_td]:border-b [&_td]:border-gray-800/30 [&_td]:text-gray-300
                [&_tr:hover]:bg-gray-800/20
                [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:pt-6 [&_h2]:border-t [&_h2]:border-gray-800 first:[&_h2]:mt-0 first:[&_h2]:pt-0 first:[&_h2]:border-0
                [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-orange-400 [&_h3]:mt-8 [&_h3]:mb-2
                [&_p]:text-gray-400 [&_p]:mb-4 [&_p]:leading-relaxed
                [&_strong]:text-yellow-400
                [&_ul]:mb-4 [&_li]:text-gray-400
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Loading analytics data...</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
