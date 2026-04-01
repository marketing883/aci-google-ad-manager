import { ScrollText, RefreshCw } from 'lucide-react';

export default function LogsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <ScrollText className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Agent Logs</h1>
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {['All', 'ResearchAgent', 'CampaignBuilder', 'Copywriter', 'Optimizer', 'BidManager', 'Orchestrator'].map((agent) => (
          <button
            key={agent}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              agent === 'All'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {agent}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Timestamp</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Agent</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Action</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Model</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Tokens</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Duration</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-gray-600 text-sm">
                No agent logs yet. Logs will appear here when AI agents execute tasks.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
