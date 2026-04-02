import { Zap } from 'lucide-react';

export default function BriefingPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Zap className="w-7 h-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold">Briefing</h1>
          <p className="text-sm text-gray-500">AI-powered insights, alerts, and recommendations</p>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <Zap className="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Briefing coming soon</h2>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Your AI morning briefing will appear here — what happened overnight, what needs attention, opportunities found, and actionable recommendations.
        </p>
      </div>
    </div>
  );
}
