import { PieChart } from 'lucide-react';

export default function PortfolioPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <PieChart className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-sm text-gray-500">Campaign health scores, budget flow, and AI recommendations</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <PieChart className="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Portfolio coming soon</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          See all your campaigns as health scorecards — performance grades, budget efficiency, wasted spend detection, and AI-powered optimization recommendations.
        </p>
      </div>
    </div>
  );
}
