'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Eye, MessageSquare, Trash2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
  recommendations: Array<{ id: string; title: string; action: string; priority: number }>;
  organic_results: unknown[];
  ai_overview_results: unknown[];
  llm_results: unknown[];
  paid_results: unknown[];
  competitor_comparison: Record<string, { organic: number; ai_citations: number; paid: number }>;
  api_cost_cents: number;
  created_at: string;
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/visibility/${id}`).then((r) => r.json()).then((d) => {
      setReport(d.error ? null : d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-center py-20 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (!report) return <div className="text-center py-20"><p className="text-gray-400">Report not found.</p><Link href="/visibility" className="text-blue-400">Back</Link></div>;

  const scoreBar = (label: string, score: number) => {
    const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
    return (
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm text-gray-400 w-28">{label}</span>
        <div className="flex-1 h-3 bg-gray-800 rounded-full"><div className={`h-3 rounded-full ${color}`} style={{ width: `${score}%` }} /></div>
        <span className="text-sm font-bold w-12 text-right">{score}</span>
      </div>
    );
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/visibility" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <Eye className="w-6 h-6 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">{report.brand_name}</h1>
          <p className="text-sm text-gray-500">{report.domain} &middot; {new Date(report.created_at).toLocaleString()} &middot; ${(report.api_cost_cents / 100).toFixed(2)} cost</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => {
              const params = new URLSearchParams({
                brand: report.brand_name,
                domain: report.domain,
                keywords: report.target_keywords.join(', '),
              });
              router.push(`/visibility/new?${params.toString()}`);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-400 hover:bg-blue-600/10 rounded-lg"
          >
            <RefreshCw className="w-4 h-4" /> Re-run
          </button>
          <button
            onClick={async () => {
              if (!confirm('Delete this report permanently?')) return;
              await fetch(`/api/visibility/${report.id}`, { method: 'DELETE' });
              router.push('/visibility');
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400/60 hover:text-red-400 hover:bg-red-600/10 rounded-lg"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      {/* Overall Score */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-6 mb-4">
          <div className={`w-20 h-20 rounded-xl flex items-center justify-center ${report.overall_score >= 70 ? 'bg-green-600' : report.overall_score >= 40 ? 'bg-yellow-600' : 'bg-red-600'}`}>
            <span className="text-white text-3xl font-bold">{report.overall_score}</span>
          </div>
          <div className="flex-1">
            {scoreBar('Organic', report.organic_score)}
            {scoreBar('AI Overviews', report.ai_overview_score)}
            {scoreBar('LLM', report.llm_score)}
            {scoreBar('Paid Search', report.paid_score)}
          </div>
        </div>
        <p className="text-xs text-gray-500">{report.target_keywords.length} keywords analyzed</p>
      </div>

      {/* Competitor Comparison */}
      {Object.keys(report.competitor_comparison || {}).length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Competitor Comparison</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 border-b border-gray-800"><th className="text-left py-2">Domain</th><th className="text-center py-2">Organic Hits</th><th className="text-center py-2">AI Citations</th><th className="text-center py-2">Paid Ads</th></tr></thead>
            <tbody>
              {Object.entries(report.competitor_comparison).sort(([, a], [, b]) => (b.organic + b.ai_citations + b.paid) - (a.organic + a.ai_citations + a.paid)).slice(0, 10).map(([domain, data]) => (
                <tr key={domain} className="border-b border-gray-800/50">
                  <td className="py-2 text-white">{domain}</td>
                  <td className="py-2 text-center text-gray-400">{data.organic}</td>
                  <td className="py-2 text-center text-gray-400">{data.ai_citations}</td>
                  <td className="py-2 text-center text-gray-400">{data.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Action Plan</h2>
          <div className="space-y-3">
            {report.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-800/40 rounded-lg">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${rec.priority === 1 ? 'bg-red-600/20 text-red-400' : rec.priority === 2 ? 'bg-yellow-600/20 text-yellow-400' : 'bg-gray-700 text-gray-400'}`}>{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{rec.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{rec.action}</p>
                </div>
                <button onClick={() => { const msg = encodeURIComponent(`${rec.action} Help me implement this.`); router.push(`/chat?prefill=${msg}`); }} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 shrink-0">
                  <MessageSquare className="w-3 h-3" /> Fix
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
