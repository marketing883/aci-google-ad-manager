'use client';

import { useState } from 'react';
import { RefreshCw, MessageSquare, Loader2 } from 'lucide-react';
import Link from 'next/link';

export function TopBar() {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch('/api/performance/sync', { method: 'POST' });
    } catch { /* ignore */ }
    setSyncing(false);
  }

  return (
    <header className="h-16 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 ml-64">
      <div id="page-header" />

      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm"
          title="Sync Google Ads data"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Syncing...' : 'Sync'}
        </button>

        <Link
          href="/chat"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          AI Chat
        </Link>
      </div>
    </header>
  );
}
