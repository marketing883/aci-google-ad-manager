'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Link2, Brain, Clock, Loader2, CheckCircle, Building2, Plus, X } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // Company profile state
  interface Service { name: string; landing_page: string; description: string }
  interface Competitor { name: string; domain: string }
  interface CompanyProfile {
    company_name: string; domain: string; tagline: string;
    services: Service[]; differentiators: string[];
    target_industries: string[]; known_competitors: Competitor[];
    brand_terms: string[]; default_negative_keywords: string[];
    tone: string;
  }
  const emptyProfile: CompanyProfile = {
    company_name: '', domain: '', tagline: '', services: [],
    differentiators: [], target_industries: [], known_competitors: [],
    brand_terms: [], default_negative_keywords: [], tone: '',
  };
  const [profile, setProfile] = useState<CompanyProfile>(emptyProfile);

  function loadProfile(s: Record<string, unknown>) {
    if (s.company_profile && typeof s.company_profile === 'object') {
      setProfile({ ...emptyProfile, ...(s.company_profile as Partial<CompanyProfile>) });
    }
  }

  useEffect(() => {
    fetchSettings();
    checkConnection();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
      const data = await res.json();
      setSettings(data);
      loadProfile(data);
    } catch (e) {
      setSaveError(`Could not load settings: ${(e as Error).message}`);
    }
  }

  async function checkConnection() {
    try {
      const res = await fetch('/api/google-ads/auth/status');
      const data = await res.json();
      setConnected(data.connected);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      // Only send changed settings + company profile (always include profile)
      const toSave: Record<string, unknown> = { company_profile: profile };
      for (const key of dirtyKeys) {
        toSave[key] = settings[key];
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || `Save failed (${res.status})`);
      }

      setSaved(true);
      setDirtyKeys(new Set()); // Clear dirty tracking
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaveError((e as Error).message);
    }
    setSaving(false);
  }

  function updateSetting(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  }

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
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>{connected ? 'Connected' : 'Not Connected'}</span>
              </div>
            </div>
            <Link href="/settings/connection" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
              {connected ? 'Manage Connection' : 'Connect Account'}
            </Link>
          </div>
        </div>

        {/* Google Analytics Connection */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Link2 className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Google Analytics 4</h2>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">GA4 Property ID</label>
            <input type="text" value={(settings.ga4_property_id as string) || ''} onChange={(e) => updateSetting('ga4_property_id', e.target.value)} placeholder="123456789" className="w-64 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-[10px] text-gray-600 mt-1">Find this in GA4: Admin → Property Settings → Property ID. Just the number, no &quot;properties/&quot; prefix.</p>
          </div>
        </div>

        {/* Company Profile */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Company Profile</h2>
          </div>
          <p className="text-xs text-gray-500 mb-5 ml-8">The AI uses this to write better ads, pick relevant keywords, and target your real competitors.</p>

          <div className="space-y-5">
            {/* Basic Info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Company Name</label>
                <input type="text" value={profile.company_name} onChange={(e) => setProfile((p) => ({ ...p, company_name: e.target.value }))} placeholder="ACI InfoTech" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Domain</label>
                <input type="text" value={profile.domain} onChange={(e) => setProfile((p) => ({ ...p, domain: e.target.value }))} placeholder="aciinfotech.com" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tagline</label>
                <input type="text" value={profile.tagline} onChange={(e) => setProfile((p) => ({ ...p, tagline: e.target.value }))} placeholder="Microsoft partner — D365, Azure" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Services */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Services / Products (comma-separated)</label>
              <input type="text" value={profile.services.map((s) => s.name).join(', ')} onChange={(e) => setProfile((p) => ({ ...p, services: e.target.value.split(',').map((s) => ({ name: s.trim(), landing_page: '', description: '' })).filter((s) => s.name) }))} placeholder="Dynamics 365, Azure Cloud, Power Platform, AI Solutions" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-gray-600 mt-1">The AI uses these as seed keywords for research. Landing pages are provided per-campaign in chat.</p>
            </div>

            {/* Differentiators */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Differentiators / USPs (used in ad copy)</label>
                <button onClick={() => setProfile((p) => ({ ...p, differentiators: [...p.differentiators, ''] }))} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
              </div>
              {profile.differentiators.map((d, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" value={d} onChange={(e) => { const arr = [...profile.differentiators]; arr[i] = e.target.value; setProfile((p) => ({ ...p, differentiators: arr })); }} placeholder="e.g., 15+ years Microsoft Gold Partner" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => setProfile((p) => ({ ...p, differentiators: p.differentiators.filter((_, j) => j !== i) }))} className="text-red-400/50 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            {/* Target Industries + Known Competitors side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Target Industries (comma-separated)</label>
                <input type="text" value={profile.target_industries.join(', ')} onChange={(e) => setProfile((p) => ({ ...p, target_industries: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="Manufacturing, Healthcare, Retail" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Brand Terms to Defend (comma-separated)</label>
                <input type="text" value={profile.brand_terms.join(', ')} onChange={(e) => setProfile((p) => ({ ...p, brand_terms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="ACI InfoTech, ArqAI" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Known Competitors */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Known Competitors (for conquest targeting)</label>
                <button onClick={() => setProfile((p) => ({ ...p, known_competitors: [...p.known_competitors, { name: '', domain: '' }] }))} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
              </div>
              {profile.known_competitors.map((c, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" value={c.name} onChange={(e) => { const arr = [...profile.known_competitors]; arr[i] = { ...arr[i], name: e.target.value }; setProfile((p) => ({ ...p, known_competitors: arr })); }} placeholder="Competitor name" className="w-48 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" value={c.domain} onChange={(e) => { const arr = [...profile.known_competitors]; arr[i] = { ...arr[i], domain: e.target.value }; setProfile((p) => ({ ...p, known_competitors: arr })); }} placeholder="domain.com" className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button onClick={() => setProfile((p) => ({ ...p, known_competitors: p.known_competitors.filter((_, j) => j !== i) }))} className="text-red-400/50 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>

            {/* Default Negatives + Tone */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Default Negative Keywords (auto-applied to all ad groups)</label>
              <input type="text" value={profile.default_negative_keywords.join(', ')} onChange={(e) => setProfile((p) => ({ ...p, default_negative_keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} placeholder="jobs, careers, free, tutorial, training, certification" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Brand Voice / Tone</label>
              <input type="text" value={profile.tone} onChange={(e) => setProfile((p) => ({ ...p, tone: e.target.value }))} placeholder="Professional, enterprise-focused, outcome-driven" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Brain className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">AI Configuration</h2>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Primary AI Model</label>
            <select value={settings.default_ai_model as string || 'sonnet'} onChange={(e) => updateSetting('default_ai_model', e.target.value)} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="sonnet">Claude Sonnet 4 (Recommended)</option>
              <option value="haiku">Claude Haiku 3.5 (Faster)</option>
              <option value="gpt4o">GPT-4o (Fallback)</option>
            </select>
          </div>
        </div>

        {/* QA Budget Thresholds */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold">Budget Safety (QA Sentinel)</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Warning threshold ($/day)</label>
              <input type="number" value={typeof settings.qa_warn_budget_daily_micros === 'number' ? settings.qa_warn_budget_daily_micros / 1_000_000 : 500} onChange={(e) => updateSetting('qa_warn_budget_daily_micros', parseFloat(e.target.value) * 1_000_000)} className="w-40 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Hard block threshold ($/day)</label>
              <input type="number" value={typeof settings.qa_block_budget_daily_micros === 'number' ? settings.qa_block_budget_daily_micros / 1_000_000 : 2000} onChange={(e) => updateSetting('qa_block_budget_daily_micros', parseFloat(e.target.value) * 1_000_000)} className="w-40 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max keyword bid ($)</label>
              <input type="number" value={typeof settings.qa_max_keyword_bid_micros === 'number' ? settings.qa_max_keyword_bid_micros / 1_000_000 : 50} onChange={(e) => updateSetting('qa_max_keyword_bid_micros', parseFloat(e.target.value) * 1_000_000)} className="w-40 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Automation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Automation</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Performance sync interval</label>
              <select value={settings.sync_interval_hours as string || '6'} onChange={(e) => updateSetting('sync_interval_hours', parseInt(e.target.value))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Once daily</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saveError && <span className="flex items-center gap-1 text-red-400 text-sm">{saveError}</span>}
          {saved && <span className="flex items-center gap-1 text-green-400 text-sm"><CheckCircle className="w-4 h-4" /> Saved</span>}
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save Settings
          </button>
        </div>

        {/* Agent Logs link */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Agent Logs</h2>
              <p className="text-sm text-gray-400">View AI agent execution history, token usage, and errors.</p>
            </div>
            <Link href="/logs" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg">
              View Logs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
