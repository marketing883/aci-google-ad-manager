import { LayoutDashboard } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <LayoutDashboard className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Spend', value: '$0.00', change: '—' },
          { label: 'Clicks', value: '0', change: '—' },
          { label: 'Conversions', value: '0', change: '—' },
          { label: 'Avg. CPA', value: '$0.00', change: '—' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5"
          >
            <p className="text-sm text-gray-400 mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold">{kpi.value}</p>
            <p className="text-xs text-gray-500 mt-1">{kpi.change}</p>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spend Chart Placeholder */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Daily Spend</h2>
          <div className="h-64 flex items-center justify-center text-gray-600">
            Connect Google Ads to see performance data
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Pending Approvals</h2>
          <div className="text-gray-600 text-sm">
            No pending approvals
          </div>
        </div>
      </div>

      {/* Active Campaigns Table */}
      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Active Campaigns</h2>
        <div className="text-gray-600 text-sm">
          No campaigns yet. Create your first campaign to get started.
        </div>
      </div>
    </div>
  );
}
