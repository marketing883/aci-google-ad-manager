'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function NewCampaignPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/campaigns" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">New Campaign</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Creation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Create Manually</h2>
          <form className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
              <input
                type="text"
                placeholder="e.g. Cloud Consulting - Search"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Type</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="SEARCH">Search</option>
                <option value="DISPLAY">Display</option>
                <option value="PERFORMANCE_MAX">Performance Max</option>
                <option value="VIDEO">Video</option>
                <option value="SHOPPING">Shopping</option>
                <option value="DEMAND_GEN">Demand Gen</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Daily Budget ($)</label>
              <input
                type="number"
                placeholder="50.00"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            <div>
              <label className="block text-sm text-gray-400 mb-1">Target Locations</label>
              <input
                type="text"
                placeholder="e.g. United States, United Kingdom"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              Create Draft Campaign
            </button>
          </form>
        </div>

        {/* AI-Assisted Creation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">AI-Assisted</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Describe what you want to advertise and the AI will research keywords,
            build ad groups, write ad copy, and set up the entire campaign for your review.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Describe your campaign</label>
              <textarea
                rows={5}
                placeholder="e.g. I want to run a search campaign for our cloud consulting services targeting CTOs and IT directors in the UAE. Budget is $100/day. We offer cloud migration, DevOps, and managed services."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Landing Page URL</label>
              <input
                type="url"
                placeholder="https://yoursite.com/services"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button
              type="button"
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Build with AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
