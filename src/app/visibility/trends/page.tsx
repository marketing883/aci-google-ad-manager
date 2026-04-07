'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

interface Report {
  id: string;
  overall_score: number;
  organic_score: number;
  ai_overview_score: number;
  llm_score: number;
  paid_score: number;
  target_keywords: string[];
  created_at: string;
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff > 0) return <span className="text-green-400 flex items-center gap-1 text-xs"><TrendingUp className="w-3 h-3" />+{diff}</span>;
  if (diff < 0) return <span className="text-red-400 flex items-center gap-1 text-xs"><TrendingDown className="w-3 h-3" />{diff}</span>;
  return <span className="text-gray-500 flex items-center gap-1 text-xs"><Minus className="w-3 h-3" />0</span>;
}

function ScoreBar({ score, maxWidth = 200 }: { score: number; maxWidth?: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-4 bg-gray-800 rounded-full" style={{ width: maxWidth }}>
        <div className={`h-4 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold w-8">{score}</span>
    </div>
  );
}

export default function TrendsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/visibility').then((r) => r.json()).then((d) => {
      setReports(Array.isArray(d) ? d : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Reverse for chronological order (oldest first)
  const chronological = [...reports].reverse();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/visibility" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <TrendingUp className="w-6 h-6 text-green-400" />
        <div>
          <h1 className="text-2xl font-bold">Visibility Trends</h1>
          <p className="text-sm text-gray-500">Track how your scores change over time</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading...</div>
      ) : reports.length < 2 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <TrendingUp className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">Need more data</h2>
          <p className="text-gray-500 text-sm mb-4">Run at least 2 visibility reports to see trends. Run reports weekly or monthly for best tracking.</p>
          <Link href="/visibility/new" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg inline-block">Run Report</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Score Timeline */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Overall Score Timeline</h2>
            <div className="space-y-3">
              {chronological.map((report, i) => {
                const prev = i > 0 ? chronological[i - 1] : null;
                return (
                  <Link key={report.id} href={`/visibility/${report.id}`} className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/60 transition-colors">
                    <span className="text-xs text-gray-500 w-24">{new Date(report.created_at).toLocaleDateString()}</span>
                    <ScoreBar score={report.overall_score} />
                    {prev && <TrendArrow current={report.overall_score} previous={prev.overall_score} />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Score Breakdown Over Time */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Score Breakdown</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2">Date</th>
                  <th className="text-center py-2">Overall</th>
                  <th className="text-center py-2">Organic</th>
                  <th className="text-center py-2">AI Overview</th>
                  <th className="text-center py-2">LLM</th>
                  <th className="text-center py-2">Paid</th>
                  <th className="text-center py-2">Keywords</th>
                </tr>
              </thead>
              <tbody>
                {chronological.map((report, i) => {
                  const prev = i > 0 ? chronological[i - 1] : null;
                  const scoreCell = (current: number, previous?: number) => {
                    const color = current >= 70 ? 'text-green-400' : current >= 40 ? 'text-yellow-400' : 'text-red-400';
                    return (
                      <td className="py-2 text-center">
                        <span className={`font-bold ${color}`}>{current}</span>
                        {previous !== undefined && (
                          <span className={`text-[10px] ml-1 ${current > previous ? 'text-green-400' : current < previous ? 'text-red-400' : 'text-gray-600'}`}>
                            {current > previous ? `+${current - previous}` : current < previous ? `${current - previous}` : ''}
                          </span>
                        )}
                      </td>
                    );
                  };

                  return (
                    <tr key={report.id} className="border-b border-gray-800/50">
                      <td className="py-2 text-gray-400">{new Date(report.created_at).toLocaleDateString()}</td>
                      {scoreCell(report.overall_score, prev?.overall_score)}
                      {scoreCell(report.organic_score, prev?.organic_score)}
                      {scoreCell(report.ai_overview_score, prev?.ai_overview_score)}
                      {scoreCell(report.llm_score, prev?.llm_score)}
                      {scoreCell(report.paid_score, prev?.paid_score)}
                      <td className="py-2 text-center text-gray-500">{report.target_keywords.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Latest vs First comparison */}
          {reports.length >= 2 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Progress: First Report vs Latest</h2>
              <div className="grid grid-cols-5 gap-4">
                {(['overall_score', 'organic_score', 'ai_overview_score', 'llm_score', 'paid_score'] as const).map((key) => {
                  const labels: Record<string, string> = { overall_score: 'Overall', organic_score: 'Organic', ai_overview_score: 'AI Overview', llm_score: 'LLM', paid_score: 'Paid' };
                  const first = chronological[0][key];
                  const latest = chronological[chronological.length - 1][key];
                  const diff = latest - first;
                  return (
                    <div key={key} className="text-center">
                      <p className="text-xs text-gray-500 mb-2">{labels[key]}</p>
                      <p className="text-sm text-gray-400">{first} → <span className="font-bold text-white">{latest}</span></p>
                      <p className={`text-sm font-bold mt-1 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {diff > 0 ? `+${diff}` : diff < 0 ? diff : '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
