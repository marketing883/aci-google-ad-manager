'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Loader2, Globe, Bot, DollarSign, Sparkles } from 'lucide-react';

interface Report {
  id: string;
  brand_name: string;
  domain: string;
  overall_score: number;
  organic_score: number;
  ai_overview_score: number;
  llm_score: number;
  paid_score: number;
  target_keywords: string[];
  organic_results: Array<{ keyword: string; brand_position: number | null; top_competitor: string | null }>;
  ai_overview_results: Array<{ keyword: string; has_overview: boolean; brand_cited: boolean; citations: string[] }>;
  llm_results: Array<{ keyword: string; question: string; mentioned: boolean; position: number | null; competitors_mentioned: string[] }>;
  paid_results: Array<{ keyword: string; brand_ad: number | null; competitor_ads: string[] }>;
  created_at: string;
}

export default function SearchVisibilityPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/visibility').then((r) => r.json()).then((d) => {
      setReports(Array.isArray(d) ? d : []);
      if (Array.isArray(d) && d.length > 0) setSelected(d[0]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const scoreBadge = (score: number) => {
    const color = score >= 70 ? 'bg-green-600/20 text-green-400' : score >= 40 ? 'bg-yellow-600/20 text-yellow-400' : 'bg-red-600/20 text-red-400';
    return <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{score}/100</span>;
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/visibility" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <Search className="w-6 h-6 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">Search Visibility</h1>
          <p className="text-sm text-gray-500">Organic rankings, AI Overviews, LLM mentions, paid ads</p>
        </div>
        <div className="ml-auto">
          <Link href="/visibility/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">New Report</Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading...</div>
      ) : !selected ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No visibility reports yet</h2>
          <p className="text-gray-500 text-sm mb-4">Run your first report to see how your brand appears across search.</p>
          <Link href="/visibility/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg inline-block">Run First Report</Link>
        </div>
      ) : (
        <div>
          {/* Report selector */}
          {reports.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {reports.slice(0, 10).map((r) => (
                <button key={r.id} onClick={() => setSelected(r)} className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap ${selected.id === r.id ? 'bg-blue-600/20 text-blue-400' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {new Date(r.created_at).toLocaleDateString()} ({r.overall_score}/100)
                </button>
              ))}
            </div>
          )}

          {/* Scores overview */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <Globe className="w-5 h-5 text-blue-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Organic</p>
              <p className="text-2xl font-bold mt-1">{selected.organic_score}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <Sparkles className="w-5 h-5 text-purple-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">AI Overviews</p>
              <p className="text-2xl font-bold mt-1">{selected.ai_overview_score}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <Bot className="w-5 h-5 text-green-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">LLM</p>
              <p className="text-2xl font-bold mt-1">{selected.llm_score}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <DollarSign className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Paid</p>
              <p className="text-2xl font-bold mt-1">{selected.paid_score}</p>
            </div>
          </div>

          {/* Organic Results */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Organic Rankings {scoreBadge(selected.organic_score)}</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-800"><th className="text-left py-2">Keyword</th><th className="text-left py-2">Your Position</th><th className="text-left py-2">Top Competitor</th></tr></thead>
              <tbody>
                {selected.organic_results?.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 text-white">{r.keyword}</td>
                    <td className={`py-2 ${r.brand_position ? (r.brand_position <= 3 ? 'text-green-400' : r.brand_position <= 10 ? 'text-yellow-400' : 'text-red-400') : 'text-red-400'}`}>
                      {r.brand_position ? `#${r.brand_position}` : 'Not found'}
                    </td>
                    <td className="py-2 text-gray-400">{r.top_competitor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* AI Overview Results */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">AI Overview Citations {scoreBadge(selected.ai_overview_score)}</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-800"><th className="text-left py-2">Keyword</th><th className="text-left py-2">AI Overview?</th><th className="text-left py-2">You Cited?</th><th className="text-left py-2">Who&apos;s Cited</th></tr></thead>
              <tbody>
                {selected.ai_overview_results?.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 text-white">{r.keyword}</td>
                    <td className="py-2">{r.has_overview ? <span className="text-blue-400">Yes</span> : <span className="text-gray-600">No</span>}</td>
                    <td className="py-2">{r.brand_cited ? <span className="text-green-400">Yes</span> : r.has_overview ? <span className="text-red-400">No</span> : <span className="text-gray-600">—</span>}</td>
                    <td className="py-2 text-gray-400 text-xs">{r.citations?.slice(0, 3).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* LLM Results */}
          {selected.llm_results?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">LLM Visibility (ChatGPT) {scoreBadge(selected.llm_score)}</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-500 border-b border-gray-800"><th className="text-left py-2">Question Asked</th><th className="text-left py-2">Mentioned?</th><th className="text-left py-2">Position</th><th className="text-left py-2">Competitors</th></tr></thead>
                <tbody>
                  {selected.llm_results.map((r, i) => (
                    <tr key={i} className="border-b border-gray-800/50">
                      <td className="py-2 text-white text-xs">{r.question}</td>
                      <td className="py-2">{r.mentioned ? <span className="text-green-400">Yes</span> : <span className="text-red-400">No</span>}</td>
                      <td className="py-2 text-gray-400">{r.position ? `#${r.position}` : '—'}</td>
                      <td className="py-2 text-gray-400 text-xs">{r.competitors_mentioned?.slice(0, 3).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paid Results */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Paid Search Presence {scoreBadge(selected.paid_score)}</h2>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-800"><th className="text-left py-2">Keyword</th><th className="text-left py-2">Your Ad</th><th className="text-left py-2">Competitor Ads</th></tr></thead>
              <tbody>
                {selected.paid_results?.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 text-white">{r.keyword}</td>
                    <td className={`py-2 ${r.brand_ad ? 'text-green-400' : 'text-red-400'}`}>{r.brand_ad ? `#${r.brand_ad}` : 'Not bidding'}</td>
                    <td className="py-2 text-gray-400 text-xs">{r.competitor_ads?.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
