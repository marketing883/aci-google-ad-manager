'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';

export default function EditCampaignPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [bidding, setBidding] = useState('MAXIMIZE_CLICKS');
  const [geoTargets, setGeoTargets] = useState('');

  useEffect(() => { fetchCampaign(); }, [id]);

  async function fetchCampaign() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setName(data.name || '');
      setBudget(data.budget_amount_micros ? (data.budget_amount_micros / 1_000_000).toString() : '');
      setBidding(data.bidding_strategy || 'MAXIMIZE_CLICKS');
      setGeoTargets(
        (data.geo_targets || [])
          .map((g: { country?: string; region?: string; city?: string }) => g.country || g.region || g.city)
          .filter(Boolean)
          .join(', ')
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign');
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          budget_amount_micros: Math.round(parseFloat(budget || '0') * 1_000_000),
          bidding_strategy: bidding,
          geo_targets: geoTargets ? geoTargets.split(',').map((g) => ({ country: g.trim() })) : [],
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/campaigns/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign');
    }
    setSaving(false);
  }

  if (loading) return <div className="text-gray-500 text-center py-12">Loading...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/campaigns/${id}`} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">Edit Campaign</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">{error}</div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Daily Budget ($)</label>
            <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} step="0.01" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
            <label className="block text-sm text-gray-400 mb-1">Target Locations</label>
            <input type="text" value={geoTargets} onChange={(e) => setGeoTargets(e.target.value)} placeholder="e.g. United States, UAE" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Save Changes
            </button>
            <Link href={`/campaigns/${id}`} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
