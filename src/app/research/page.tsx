import { Search, Sparkles } from 'lucide-react';

export default function ResearchPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Search className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold">Keyword Research</h1>
      </div>

      {/* Research Input */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Business / Product Description</label>
              <textarea
                rows={3}
                placeholder="e.g. We offer cloud migration and DevOps consulting services for enterprise companies in the Middle East..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Seed Keywords (optional)</label>
                <input
                  type="text"
                  placeholder="cloud consulting, devops services"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Competitor Domains (optional)</label>
                <input
                  type="text"
                  placeholder="competitor1.com, competitor2.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Research Keywords
            </button>
          </div>
        </div>
      </div>

      {/* Results Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Keyword Suggestions</h2>
          <div className="text-gray-600 text-sm py-8 text-center">
            Run a research query to see keyword suggestions with volume, competition, and suggested bids.
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Competitor Insights</h2>
          <div className="text-gray-600 text-sm py-8 text-center">
            Add competitor domains above to see their ad strategies and keywords.
          </div>
        </div>
      </div>
    </div>
  );
}
