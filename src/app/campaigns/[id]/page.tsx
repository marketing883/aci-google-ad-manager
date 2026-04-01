import Link from 'next/link';
import { ArrowLeft, Pencil, Play, Pause, ChevronDown } from 'lucide-react';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/campaigns" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Campaign Details</h1>
            <p className="text-sm text-gray-500">ID: {id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors">
            <Pause className="w-4 h-4" />
            Pause
          </button>
          <Link
            href={`/campaigns/${id}/edit`}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* Campaign Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Performance</h2>
          <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
            Performance chart will appear here once the campaign is active
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className="px-2 py-0.5 bg-gray-800 rounded text-gray-300">Draft</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span>Search</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Budget</span>
              <span>$0.00/day</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Bidding</span>
              <span>Maximize Clicks</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ad Groups */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Ad Groups</h2>
          <button className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-sm rounded-lg transition-colors">
            + Add Ad Group
          </button>
        </div>
        <div className="text-gray-600 text-sm py-8 text-center">
          No ad groups yet. Add one to start building your campaign structure.
        </div>
      </div>
    </div>
  );
}
