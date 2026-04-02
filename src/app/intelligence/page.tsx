'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Radar, Plus, Trash2, RefreshCw, Loader2, MessageSquare,
  ArrowRight, Globe, Tag, TrendingUp, Shield, AlertTriangle,
  Search, Eye, X,
} from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface Competitor {
  id: string;
  domain: string;
  company_name: string | null;
  observed_keywords: Array<{ text: string; first_seen?: string; last_seen?: string }>;
  observed_ads: Array<{ description?: string; headline?: string; first_seen?: string }>;
  auction_insights: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Helpers
// ============================================================

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getThreatLevel(competitor: Competitor): { level: string; color: string; bgColor: string } {
  const kwCount = competitor.observed_keywords?.length || 0;
  const adCount = competitor.observed_ads?.length || 0;
  const hasNotes = !!competitor.notes;
  const score = kwCount * 2 + adCount * 3 + (hasNotes ? 5 : 0);

  if (score >= 20) return { level: 'Critical', color: 'text-red-400', bgColor: 'bg-red-600' };
  if (score >= 10) return { level: 'High', color: 'text-orange-400', bgColor: 'bg-orange-600' };
  if (score >= 5) return { level: 'Medium', color: 'text-yellow-400', bgColor: 'bg-yellow-600' };
  return { level: 'Low', color: 'text-gray-400', bgColor: 'bg-gray-600' };
}

// ============================================================
// Add Competitor Modal
// ============================================================

function AddCompetitorModal({ onAdd, onClose }: { onAdd: (domain: string, name: string) => void; onClose: () => void }) {
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Track Competitor</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Domain</label>
            <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. accenture.com" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Company Name (optional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accenture" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { if (domain.trim()) { onAdd(domain.trim(), name.trim()); } }} disabled={!domain.trim()} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-lg">
              Add Competitor
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">Cancel</button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Tip: After adding, ask the AI Chat to run a deep analysis: "Analyze competitor accenture.com"
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Competitor Card
// ============================================================

function CompetitorCard({ competitor, onDelete, onAnalyze }: {
  competitor: Competitor;
  onDelete: (id: string) => void;
  onAnalyze: (domain: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const threat = getThreatLevel(competitor);
  const keywords = competitor.observed_keywords || [];
  const ads = competitor.observed_ads || [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{competitor.company_name || competitor.domain}</h3>
              <p className="text-xs text-gray-500">{competitor.domain}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${threat.bgColor} text-white`}>
              {threat.level}
            </span>
            <button onClick={() => onDelete(competitor.id)} className="p-1.5 hover:bg-red-600/20 rounded text-gray-500 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-gray-500">Keywords</p>
            <p className="text-lg font-bold">{keywords.length}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-gray-500">Ad Themes</p>
            <p className="text-lg font-bold">{ads.length}</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-2.5 text-center">
            <p className="text-xs text-gray-500">Last Updated</p>
            <p className="text-sm font-medium">{timeAgo(competitor.updated_at)}</p>
          </div>
        </div>

        {/* Strategic Notes */}
        {competitor.notes && (
          <div className="flex items-start gap-2 p-3 bg-purple-900/10 border border-purple-800/30 rounded-lg mb-3">
            <Shield className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-300 leading-relaxed">{competitor.notes}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button onClick={() => onAnalyze(competitor.domain)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded-lg transition-colors">
            <MessageSquare className="w-3.5 h-3.5" />
            Deep Analysis in Chat
          </button>
          <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded-lg">
            <Eye className="w-3.5 h-3.5" />
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-800 p-5 space-y-4">
          {/* Observed Keywords */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Observed Keywords
            </h4>
            {keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded">
                    {typeof kw === 'string' ? kw : kw.text}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No keywords observed yet. Run a deep analysis to discover them.</p>
            )}
          </div>

          {/* Observed Ad Themes */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Search className="w-3 h-3" /> Ad Copy Themes
            </h4>
            {ads.length > 0 ? (
              <div className="space-y-1.5">
                {ads.map((ad, i) => (
                  <div key={i} className="p-2 bg-gray-800/50 rounded text-xs text-gray-300">
                    {typeof ad === 'string' ? ad : (ad.headline || ad.description || JSON.stringify(ad))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No ad themes observed yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Intelligence Page
// ============================================================

export default function IntelligencePage() {
  const router = useRouter();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => { fetchCompetitors(); }, []);

  async function fetchCompetitors() {
    setLoading(true);
    try {
      const res = await fetch('/api/competitors');
      const data = await res.json();
      setCompetitors(Array.isArray(data) ? data : []);
    } catch { setCompetitors([]); }
    setLoading(false);
  }

  async function addCompetitor(domain: string, name: string) {
    try {
      await fetch('/api/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, company_name: name }),
      });
      setShowAddModal(false);
      fetchCompetitors();
    } catch { /* ignore */ }
  }

  async function deleteCompetitor(id: string) {
    if (!confirm('Remove this competitor from tracking?')) return;
    try {
      await fetch(`/api/competitors?id=${id}`, { method: 'DELETE' });
      fetchCompetitors();
    } catch { /* ignore */ }
  }

  function analyzeInChat(domain: string) {
    const message = encodeURIComponent(`Run a deep competitive analysis on ${domain} — what keywords are they targeting, what's their ad strategy, what are their strengths and weaknesses, and where can we outmaneuver them?`);
    router.push(`/chat?prefill=${message}`);
  }

  // Separate competitors by threat level
  const criticalThreats = competitors.filter((c) => getThreatLevel(c).level === 'Critical');
  const highThreats = competitors.filter((c) => getThreatLevel(c).level === 'High');
  const otherCompetitors = competitors.filter((c) => !['Critical', 'High'].includes(getThreatLevel(c).level));

  return (
    <div>
      {/* Add Modal */}
      {showAddModal && <AddCompetitorModal onAdd={addCompetitor} onClose={() => setShowAddModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radar className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Intelligence</h1>
            <p className="text-sm text-gray-500">Competitor war room — tracking, analysis, and counter-strategies</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchCompetitors} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
            <Plus className="w-4 h-4" /> Track Competitor
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">Tracked</p>
          <p className="text-2xl font-bold">{competitors.length}</p>
        </div>
        <div className="bg-gray-900 border border-red-900/30 rounded-xl p-4 text-center">
          <p className="text-xs text-red-400">Critical Threats</p>
          <p className="text-2xl font-bold text-red-400">{criticalThreats.length}</p>
        </div>
        <div className="bg-gray-900 border border-orange-900/30 rounded-xl p-4 text-center">
          <p className="text-xs text-orange-400">High Threats</p>
          <p className="text-2xl font-bold text-orange-400">{highThreats.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400">Total Keywords Observed</p>
          <p className="text-2xl font-bold">{competitors.reduce((s, c) => s + (c.observed_keywords?.length || 0), 0)}</p>
        </div>
      </div>

      {/* Quick Analysis CTA */}
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-800/30 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Run AI-Powered Competitor Scan</h2>
            <p className="text-xs text-gray-400">Ask the AI to discover competitors from your keywords and analyze their strategies.</p>
          </div>
          <Link href="/chat" className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg shrink-0">
            <MessageSquare className="w-4 h-4" /> Scan in Chat
          </Link>
        </div>
      </div>

      {/* Competitor Grid */}
      {loading ? (
        <div className="text-gray-500 text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading competitors...</div>
      ) : competitors.length > 0 ? (
        <div className="space-y-6">
          {/* Critical Threats */}
          {criticalThreats.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Critical Threats
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {criticalThreats.map((c) => (
                  <CompetitorCard key={c.id} competitor={c} onDelete={deleteCompetitor} onAnalyze={analyzeInChat} />
                ))}
              </div>
            </div>
          )}

          {/* High Threats */}
          {highThreats.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3">High Threats</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {highThreats.map((c) => (
                  <CompetitorCard key={c.id} competitor={c} onDelete={deleteCompetitor} onAnalyze={analyzeInChat} />
                ))}
              </div>
            </div>
          )}

          {/* Other */}
          {otherCompetitors.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Monitoring</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {otherCompetitors.map((c) => (
                  <CompetitorCard key={c.id} competitor={c} onDelete={deleteCompetitor} onAnalyze={analyzeInChat} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <Radar className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No competitors tracked yet</h2>
          <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
            Add competitors manually or ask the AI to discover them from your keywords and market.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setShowAddModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Manually
            </button>
            <Link href="/chat" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Discover via AI
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
