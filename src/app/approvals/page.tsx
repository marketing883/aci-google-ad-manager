'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CheckSquare, Loader2 } from 'lucide-react';

interface ApprovalItem {
  id: string;
  action_type: string;
  entity_type: string;
  status: string;
  ai_reasoning: string | null;
  confidence_score: number | null;
  priority: string;
  agent_name: string | null;
  created_at: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => { fetchApprovals(); }, [filter]);

  async function fetchApprovals() {
    setLoading(true);
    try {
      const res = await fetch(`/api/approvals?status=${filter}`);
      const data = await res.json();
      setApprovals(Array.isArray(data) ? data : []);
    } catch { setApprovals([]); }
    setLoading(false);
  }

  async function handleBulkApprove() {
    const pendingIds = approvals.filter((a) => a.status === 'pending').map((a) => a.id);
    if (pendingIds.length === 0) return;
    if (!confirm(`Approve all ${pendingIds.length} pending items? This will push them to Google Ads.`)) return;
    setBulkLoading(true);
    try {
      await fetch('/api/approvals/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingIds, action: 'approve' }),
      });
      fetchApprovals();
    } catch { /* ignore */ }
    setBulkLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Approval Queue</h1>
        </div>
        {filter === 'pending' && approvals.length > 0 && (
          <button onClick={handleBulkApprove} disabled={bulkLoading} className="px-3 py-1.5 text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg transition-colors flex items-center gap-2">
            {bulkLoading && <Loader2 className="w-3 h-3 animate-spin" />}
            Approve All ({approvals.length})
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        {['pending', 'approved', 'applied', 'rejected', 'failed', 'expired'].map((tab) => (
          <button key={tab} onClick={() => setFilter(tab)} className={`px-3 py-1.5 text-sm rounded-lg transition-colors capitalize ${filter === tab ? 'bg-orange-600/20 text-orange-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading...</div>
      ) : approvals.length > 0 ? (
        <div className="space-y-3">
          {approvals.map((a) => (
            <Link key={a.id} href={`/approvals/${a.id}`} className="block bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{a.action_type.replace(/_/g, ' ')}</p>
                  <p className="text-sm text-gray-400 mt-1">{a.entity_type} &bull; {a.agent_name || 'Manual'} &bull; {new Date(a.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  {a.confidence_score !== null && (
                    <span className="text-xs text-gray-500">{(a.confidence_score * 100).toFixed(0)}% confidence</span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.priority === 'urgent' ? 'bg-red-600 text-white' : a.priority === 'high' ? 'bg-orange-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
                    {a.priority}
                  </span>
                </div>
              </div>
              {a.ai_reasoning && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{a.ai_reasoning}</p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <CheckSquare className="w-12 h-12 text-gray-700 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-300 mb-2">No {filter} approvals</h2>
          <p className="text-gray-500 text-sm">When AI agents propose changes, they appear here for your review.</p>
        </div>
      )}
    </div>
  );
}
