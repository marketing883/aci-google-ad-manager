'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';

export default function NewReportPage() {
  const router = useRouter();
  const [brandName, setBrandName] = useState('');
  const [domain, setDomain] = useState('');
  const [keywords, setKeywords] = useState('');
  const [includeLlm, setIncludeLlm] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');

  // Auto-fill from company profile
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((s) => {
      if (s.company_profile) {
        const p = s.company_profile;
        if (p.company_name) setBrandName(p.company_name);
        if (p.domain) setDomain(p.domain);
        if (p.services?.length) {
          setKeywords(p.services.map((s: { name: string }) => s.name).join(', '));
        }
      }
    }).catch(() => {});
  }, []);

  async function runReport() {
    if (!brandName || !domain || !keywords.trim()) return;
    setRunning(true);
    setProgress('Starting visibility report...');

    try {
      const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      setProgress(`Checking ${keywordList.length} keywords across Google, AI Overviews${includeLlm ? ', ChatGPT' : ''}, and paid search...`);

      const res = await fetch('/api/visibility/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: brandName,
          domain,
          target_keywords: keywordList,
          include_llm_check: includeLlm,
        }),
      });

      const data = await res.json();
      if (data.report_id) {
        router.push(`/visibility/${data.report_id}`);
      } else {
        setProgress(data.error || 'Report completed. Check the Visibility dashboard.');
        setRunning(false);
      }
    } catch (e) {
      setProgress(`Error: ${(e as Error).message}`);
      setRunning(false);
    }
  }

  const keywordCount = keywords.split(',').map((k) => k.trim()).filter(Boolean).length;
  const estCost = (keywordCount * 0.004 + (includeLlm ? keywordCount * 0.01 : 0)).toFixed(2);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/visibility" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <Search className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold">New Visibility Report</h1>
      </div>

      <div className="max-w-2xl">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Brand Name</label>
              <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="ACI InfoTech" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Domain</label>
              <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="aciinfotech.com" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Target Keywords (comma-separated)</label>
            <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="dynamics 365 consulting, d365 implementation, ERP migration, Microsoft partner" rows={3} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <p className="text-xs text-gray-500 mt-1">{keywordCount} keywords &middot; Est. cost: ${estCost}</p>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input type="checkbox" checked={includeLlm} onChange={(e) => setIncludeLlm(e.target.checked)} className="rounded border-gray-600" />
              Check LLM visibility (ChatGPT) — adds ~${(keywordCount * 0.01).toFixed(2)}
            </label>
          </div>

          <button onClick={runReport} disabled={running || !brandName || !domain || keywordCount === 0} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg flex items-center justify-center gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {running ? 'Running...' : 'Generate Report'}
          </button>

          {progress && (
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400">{progress}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
