'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  Globe,
  Loader2,
  Smartphone,
  Target,
  type LucideIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FeatureNotReady } from '@/components/SetupBanner';
import { PageHeader } from '@/components/patterns/PageHeader';
import { api } from '@/lib/api-client';

type ReportType =
  | 'overview'
  | 'landing_pages'
  | 'ad_traffic'
  | 'conversions'
  | 'devices';

interface TabDef {
  id: ReportType;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'landing_pages', label: 'Landing pages', icon: Globe },
  { id: 'ad_traffic', label: 'Ad traffic', icon: Target },
  { id: 'conversions', label: 'Conversions', icon: Target },
  { id: 'devices', label: 'Devices', icon: Smartphone },
];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<ReportType>('overview');
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [ga4Ready, setGa4Ready] = useState<boolean | null>(null);

  const fetchReport = useCallback(
    async (type: ReportType, daysOverride?: number) => {
      setLoading(true);
      setActiveTab(type);
      try {
        const result = await api.post<{ result?: string; error?: string }>(
          '/api/analytics',
          { report_type: type, days: daysOverride ?? days },
          { toastOnError: false },
        );
        setData(result.result || result.error || 'No data available');
      } catch {
        setData('Failed to load analytics. Check GA4 connection in Settings.');
      }
      setLoading(false);
    },
    [days],
  );

  useEffect(() => {
    api
      .get<{ ga4: { connected: boolean } }>('/api/setup-status')
      .then((s) => {
        const ready = s.ga4?.connected || false;
        setGa4Ready(ready);
        if (ready) fetchReport('overview');
      })
      .catch(() => setGa4Ready(false));
  }, [fetchReport]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={
          <Button variant="ghost" size="icon" asChild className="h-9 w-9">
            <Link href="/visibility" aria-label="Back to visibility">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
        title="Website analytics"
        description="Traffic, landing pages, conversions, ad-click behavior."
      />

      {ga4Ready === false && (
        <FeatureNotReady
          feature="ga4"
          message="Google Analytics 4 is not connected. Add your GA4 Property ID in Settings to see website analytics, landing page performance, and conversion data."
        />
      )}

      {ga4Ready === null && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {ga4Ready && (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs
              value={activeTab}
              onValueChange={(v) => fetchReport(v as ReportType)}
            >
              <TabsList>
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Period</span>
              {[7, 14, 30, 90].map((d) => (
                <Button
                  key={d}
                  variant={days === d ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setDays(d);
                    fetchReport(activeTab, d);
                  }}
                  className="h-7 px-2 text-xs"
                >
                  {d}d
                </Button>
              ))}
            </div>
          </div>

          <Card className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : data ? (
              <div
                className="prose prose-invert prose-sm max-w-none
                  [&_h2]:mb-2 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-border [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground first:[&_h2]:mt-0 first:[&_h2]:border-0 first:[&_h2]:pt-0
                  [&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-accent
                  [&_li]:text-muted-foreground
                  [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground
                  [&_strong]:text-warning
                  [&_table]:mb-8 [&_table]:w-full [&_table]:text-sm
                  [&_td]:border-b [&_td]:border-border/40 [&_td]:px-4 [&_td]:py-3 [&_td]:text-foreground
                  [&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground
                  [&_thead]:bg-muted/40
                  [&_tr:hover]:bg-muted/30
                  [&_ul]:mb-4"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{data}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading analytics data…</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
