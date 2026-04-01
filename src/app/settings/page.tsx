import Link from 'next/link';
import { Settings, Link2, Brain, Clock, Bell } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Google Ads Connection */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Link2 className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Google Ads Connection</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Connect your Google Ads account to manage campaigns.</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-400">Not Connected</span>
              </div>
            </div>
            <Link
              href="/settings/connection"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Connect Account
            </Link>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Brain className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">AI Configuration</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Primary AI Model</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="sonnet">Claude Sonnet 4 (Recommended)</option>
                <option value="haiku">Claude Haiku 3.5 (Faster)</option>
                <option value="gpt4o">GPT-4o (Fallback)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Automation Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Automation</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-approve low-risk changes</p>
                <p className="text-xs text-gray-500">Bid adjustments within threshold will be applied automatically</p>
              </div>
              <button className="w-11 h-6 bg-gray-700 rounded-full relative transition-colors">
                <div className="w-5 h-5 bg-gray-400 rounded-full absolute left-0.5 top-0.5 transition-transform" />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Auto-approve bid threshold (%)</label>
              <input
                type="number"
                defaultValue={10}
                className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Performance sync interval</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Once daily</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Optimizer run time</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="8">8:00 AM daily</option>
                <option value="9">9:00 AM daily</option>
                <option value="manual">Manual only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
