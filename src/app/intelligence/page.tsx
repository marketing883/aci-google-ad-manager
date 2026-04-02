import { Radar } from 'lucide-react';

export default function IntelligencePage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Radar className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">Intelligence</h1>
          <p className="text-sm text-gray-500">Competitor war room — tracking, analysis, and counter-strategies</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <Radar className="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Intelligence coming soon</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Track competitors over time — their keywords, ad copy, estimated spend, hiring signals, and strategic moves. Get AI-generated counter-strategies and market opportunities.
        </p>
      </div>
    </div>
  );
}
