import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/campaigns/${id}`} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">Edit Campaign</h1>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl">
        <form className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Daily Budget ($)</label>
            <input
              type="number"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bidding Strategy</label>
            <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="MAXIMIZE_CLICKS">Maximize Clicks</option>
              <option value="MAXIMIZE_CONVERSIONS">Maximize Conversions</option>
              <option value="TARGET_CPA">Target CPA</option>
              <option value="TARGET_ROAS">Target ROAS</option>
              <option value="MANUAL_CPC">Manual CPC</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Save Changes
            </button>
            <Link
              href={`/campaigns/${id}`}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
