'use client';

import { useState } from 'react';
import { Search, Sparkles, Loader2 } from 'lucide-react';

interface ResearchResult {
  keywords: Array<{ text: string; avg_monthly_searches: number | null; competition: string | null; suggested_bid_micros: number | null; relevance_score?: number }>;
  competitor_deep_analysis?: Array<{ domain: string; strategic_inference: string; threat_level: string }>;
  market_opportunities?: Array<{ opportunity: string; confidence: number }>;
  strategic_summary: string;
}

export default function ResearchPage() {
  const [description, setDescription] = useState('');
  const [seedKeywords, setSeedKeywords] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResearch() {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/agents/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_description: description,
          seed_keywords: seedKeywords ? seedKeywords.split(',').map((k) => k.trim()) : [],
          competitor_domains: competitors ? competitors.split(',').map((d) => d.trim()) : [],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.research);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Search className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold">Keyword Research</h1>
      </div>

      {/* Input */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Business / Product Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. We offer cloud migration and DevOps consulting services for enterprise companies..." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Seed Keywords (comma-separated)</label>
              <input type="text" value={seedKeywords} onChange={(e) => setSeedKeywords(e.target.value)} placeholder="cloud consulting, devops services" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Competitor Domains (comma-separated)</label>
              <input type="text" value={competitors} onChange={(e) => setCompetitors(e.target.value)} placeholder="competitor1.com, competitor2.com" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <button onClick={handleResearch} disabled={loading || !description.trim()} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Researching...' : 'Research Keywords'}
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-2">Strategic Summary</h2>
            <p className="text-gray-300 text-sm">{result.strategic_summary}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Keywords */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-4">Keywords ({result.keywords.length})</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {result.keywords.map((kw, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-800 rounded-lg text-sm">
                    <span className="font-medium">{kw.text}</span>
                    <div className="flex gap-3 text-gray-400 text-xs">
                      <span>Vol: {kw.avg_monthly_searches?.toLocaleString() || '—'}</span>
                      <span>Comp: {kw.competition || '—'}</span>
                      <span>Bid: {kw.suggested_bid_micros ? `$${(kw.suggested_bid_micros / 1_000_000).toFixed(2)}` : '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitors */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-4">Competitor Intel</h2>
              {result.competitor_deep_analysis?.length ? (
                <div className="space-y-3">
                  {result.competitor_deep_analysis.map((c, i) => (
                    <div key={i} className="p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{c.domain}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${c.threat_level === 'critical' ? 'bg-red-600' : c.threat_level === 'high' ? 'bg-orange-600' : c.threat_level === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'} text-white`}>{c.threat_level}</span>
                      </div>
                      <p className="text-xs text-gray-400">{c.strategic_inference}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 text-sm">No competitor data. Add domains above.</p>
              )}
            </div>
          </div>

          {/* Opportunities */}
          {result.market_opportunities && result.market_opportunities.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-4">Market Opportunities</h2>
              <div className="space-y-2">
                {result.market_opportunities.map((o, i) => (
                  <div key={i} className="p-3 bg-gray-800 rounded-lg text-sm">
                    <p className="font-medium">{o.opportunity}</p>
                    <p className="text-gray-400 text-xs mt-1">Confidence: {(o.confidence * 100).toFixed(0)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
