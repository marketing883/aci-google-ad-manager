'use client';

import { useState, useEffect } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';

interface LogEntry {
  id: string;
  agent_name: string;
  action: string;
  model_used: string | null;
  tokens_used: { input: number; output: number } | null;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  output_summary: string | null;
  created_at: string;
}

const AGENTS = ['all', 'OrchestratorAgent', 'ResearchAgent', 'CampaignBuilderAgent', 'CopywriterAgent', 'OptimizerAgent', 'BidManagerAgent'];

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchLogs(); }, [filter]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?agent=${filter}&limit=100`);
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <ScrollText className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Agent Logs</h1>
        </div>
        <button onClick={fetchLogs} className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {AGENTS.map((agent) => (
          <button key={agent} onClick={() => setFilter(agent)} className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filter === agent ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            {agent === 'all' ? 'All' : agent.replace('Agent', '')}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Time</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Agent</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Action</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Model</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Tokens</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Duration</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-600 text-sm">Loading logs...</td></tr>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm">{log.agent_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{log.action}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{log.model_used || '—'}</td>
                  <td className="text-right px-4 py-3 text-xs text-gray-400">
                    {log.tokens_used ? `${log.tokens_used.input}/${log.tokens_used.output}` : '—'}
                  </td>
                  <td className="text-right px-4 py-3 text-xs text-gray-400">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${log.status === 'success' ? 'bg-green-600/20 text-green-400' : log.status === 'error' ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-600 text-sm">No logs yet. Logs appear when AI agents execute tasks.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
