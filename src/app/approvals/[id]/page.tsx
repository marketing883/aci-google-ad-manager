import Link from 'next/link';
import { ArrowLeft, Check, X, Pencil } from 'lucide-react';

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/approvals" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">Approval Detail</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Diff View */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Proposed Changes</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm text-gray-400 mb-2">Before</h3>
              <div className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-gray-300 min-h-[200px]">
                {/* Previous state will render here */}
                <span className="text-gray-600">No previous state</span>
              </div>
            </div>
            <div>
              <h3 className="text-sm text-gray-400 mb-2">After</h3>
              <div className="bg-gray-800 rounded-lg p-4 text-sm font-mono text-green-300 min-h-[200px]">
                {/* Proposed payload will render here */}
                <span className="text-gray-600">Loading...</span>
              </div>
            </div>
          </div>
        </div>

        {/* Approval Info + Actions */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">AI Reasoning</h2>
            <p className="text-gray-400 text-sm">
              Loading reasoning...
            </p>
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-gray-400">Confidence:</span>
              <div className="flex-1 h-2 bg-gray-800 rounded-full">
                <div className="h-2 bg-blue-500 rounded-full" style={{ width: '0%' }} />
              </div>
              <span className="text-sm text-gray-400">—</span>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <button className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Check className="w-4 h-4" />
              Approve
            </button>
            <button className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit & Approve
            </button>
            <button className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
