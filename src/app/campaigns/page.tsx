import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';

export default function CampaignsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Megaphone className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Campaigns</h1>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {['All', 'Active', 'Draft', 'Paused', 'Ended'].map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              tab === 'All'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <Megaphone className="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">No campaigns yet</h2>
        <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
          Create your first campaign manually or use AI Chat to describe what you want
          and let the agent build it for you.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/campaigns/new"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Create Manually
          </Link>
          <Link
            href="/chat"
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Use AI Chat
          </Link>
        </div>
      </div>
    </div>
  );
}
