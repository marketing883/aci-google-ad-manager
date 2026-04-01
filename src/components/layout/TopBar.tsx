'use client';

import { Bell, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export function TopBar() {
  return (
    <header className="h-16 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 ml-64">
      {/* Page title area — filled by each page */}
      <div id="page-header" />

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          title="Sync Performance Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>
    </header>
  );
}
