'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';

export default function NewCampaignPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual form state
  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState('SEARCH');
  const [budget, setBudget] = useState('');
  const [bidding, setBidding] = useState('MAXIMIZE_CLICKS');
  const [geoTargets, setGeoTargets] = useState('');

  // AI form state
  const [aiDescription, setAiDescription] = useState('');
  const [aiLandingPage, setAiLandingPage] = useState('');

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      // We need a Google Ads account ID — fetch the active one
      const statusRes = await fetch('/api/google-ads/auth/status');
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        setError('Please connect your Google Ads account first in Settings.');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          google_ads_account_id: statusData.account.id,
          name: name.trim(),
          campaign_type: campaignType,
          budget_amount_micros: Math.round(parseFloat(budget || '0') * 1_000_000),
          bidding_strategy: bidding,
          geo_targets: geoTargets ? geoTargets.split(',').map((g) => ({ country: g.trim() })) : [],
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/campaigns/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    }
    setSaving(false);
  }

  async function handleAIBuild() {
    if (!aiDescription.trim()) return;
    setAiLoading(true);
    setError(null);

    try {
      // Send to chat — the orchestrator will handle the workflow
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Build a campaign: ${aiDescription}${aiLandingPage ? `. Landing page: ${aiLandingPage}` : ''}`,
          state: 'idle',
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Redirect to chat to continue the conversation
      router.push('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI build failed');
    }
    setAiLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/campaigns" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">New Campaign</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Manual Creation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Create Manually</h2>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloud Consulting - Search" required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Type</label>
              <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
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
              <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="50.00" step="0.01" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bidding Strategy</label>
              <select value={bidding} onChange={(e) => setBidding(e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="MAXIMIZE_CLICKS">Maximize Clicks</option>
                <option value="MAXIMIZE_CONVERSIONS">Maximize Conversions</option>
                <option value="TARGET_CPA">Target CPA</option>
                <option value="TARGET_ROAS">Target ROAS</option>
                <option value="MANUAL_CPC">Manual CPC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Target Locations (comma-separated)</label>
              <input type="text" value={geoTargets} onChange={(e) => setGeoTargets(e.target.value)} placeholder="e.g. United States, United Kingdom" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={saving || !name.trim()} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Create Draft Campaign
            </button>
          </form>
        </div>

        {/* AI-Assisted */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">AI-Assisted</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">Describe what you want and the AI will research, build, and set up the entire campaign for your review.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Describe your campaign</label>
              <textarea rows={5} value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} placeholder="e.g. I want to run a search campaign for our cloud consulting services targeting CTOs and IT directors in the UAE. Budget is $100/day." className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Landing Page URL (optional)</label>
              <input type="url" value={aiLandingPage} onChange={(e) => setAiLandingPage(e.target.value)} placeholder="https://yoursite.com/services" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <button onClick={handleAIBuild} disabled={aiLoading || !aiDescription.trim()} className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiLoading ? 'Sending to AI...' : 'Build with AI'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
