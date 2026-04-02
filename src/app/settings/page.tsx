'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Link2, Brain, Clock, Loader2, CheckCircle } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetchSettings();
    checkConnection();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch { /* ignore */ }
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
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  function updateSetting(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
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
