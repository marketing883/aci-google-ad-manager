'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, ChevronRight, X } from 'lucide-react';

interface SetupStatus {
  googleAds: { connected: boolean; customerId: string | null };
  ga4: { connected: boolean; propertyId: string | null };
  companyProfile: { configured: boolean };
  dataForSeo: { configured: boolean };
  overall: { stepsComplete: number; stepsTotal: number; ready: boolean };
}

/**
 * Setup banner shown across the app when configuration is incomplete.
 * Tells users exactly what's missing and links to the fix.
 */
export function SetupBanner() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if previously dismissed this session
    if (sessionStorage.getItem('setup_banner_dismissed')) {
      setDismissed(true);
      return;
    }
    fetch('/api/setup-status')
      .then((r) => r.json())
      .then((d) => { if (d.overall) setStatus(d); })
      .catch(() => {});
  }, []);

  if (dismissed || !status || status.overall.stepsComplete === status.overall.stepsTotal) return null;

  const steps = [
    { label: 'Google Ads', done: status.googleAds.connected && !!status.googleAds.customerId, href: '/settings/connection', detail: !status.googleAds.connected ? 'Connect account' : 'Set customer ID' },
    { label: 'Google Analytics', done: status.ga4.connected, href: '/settings', detail: 'Set GA4 Property ID' },
    { label: 'Company Profile', done: status.companyProfile.configured, href: '/settings', detail: 'Add company name & domain' },
    { label: 'DataForSEO', done: status.dataForSeo.configured, href: '/settings', detail: 'Set API credentials in .env' },
  ];

  const incomplete = steps.filter((s) => !s.done);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem('setup_banner_dismissed', 'true');
  }

  return (
    <div className="bg-blue-950/50 border border-blue-800/30 rounded-lg px-4 py-3 mb-6 flex items-center gap-4">
      <AlertCircle className="w-5 h-5 text-blue-400 shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-blue-300">
          <strong>Setup {status.overall.stepsComplete}/{status.overall.stepsTotal} complete.</strong>
          {' '}
          {incomplete.length === 1
            ? `Connect ${incomplete[0].label} to unlock all features.`
            : `${incomplete.map((s) => s.label).join(', ')} still needed.`
          }
        </p>
      </div>
      <div className="flex items-center gap-2">
        {incomplete.slice(0, 2).map((step) => (
          <Link key={step.label} href={step.href} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded-lg whitespace-nowrap">
            {step.label} <ChevronRight className="w-3 h-3" />
          </Link>
        ))}
      </div>
      <button onClick={dismiss} className="text-gray-500 hover:text-gray-300 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Check if a specific feature is configured.
 * Use before making API calls that require specific setup.
 *
 * Usage in a page:
 * const { ready, message } = useFeatureCheck('ga4');
 * if (!ready) return <FeatureNotReady message={message} />;
 */
export function FeatureNotReady({ feature, message }: { feature: string; message: string }) {
  const settingsLink = feature === 'googleAds' ? '/settings/connection' : '/settings';
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
      <AlertCircle className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-white mb-2">Setup Required</h3>
      <p className="text-sm text-gray-400 mb-4">{message}</p>
      <Link href={settingsLink} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">
        Go to Settings <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
