import { CheckSquare } from 'lucide-react';

export default function ApprovalsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">Approval Queue</h1>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-sm bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg transition-colors">
            Approve All
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {['Pending', 'Approved', 'Rejected', 'Applied', 'Expired'].map((tab) => (
          <button
            key={tab}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              tab === 'Pending'
                ? 'bg-orange-600/20 text-orange-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <CheckSquare className="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">No pending approvals</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          When AI agents propose campaign changes, they will appear here for your review.
          You can approve, reject, or edit each change before it goes live.
        </p>
      </div>
    </div>
  );
}
