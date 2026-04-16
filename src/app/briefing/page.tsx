'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle,
  ChevronRight,
  DollarSign,
  Gauge,
  Info,
  Loader2,
  MessageSquare,
  MousePointerClick,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { AynMark } from '@/components/brand/Ayn';

import { useChatPanel } from '@/components/layout/ChatPanelContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AreaTrend } from '@/components/charts/AreaTrend';
import {
  PerformanceRadial,
  type RadialMetric,
} from '@/components/charts/PerformanceRadial';
import { Sparkline } from '@/components/charts/Sparkline';
import { EmptyState } from '@/components/patterns/EmptyState';
import { MetricCard } from '@/components/patterns/MetricCard';
import { PageHeader } from '@/components/patterns/PageHeader';
import {
  SkeletonFeed,
  SkeletonMetricGrid,
} from '@/components/patterns/SkeletonFeed';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type {
  FeedDataSource,
  FeedItem,
  FeedSeverity,
  IntelligenceFeedResponse,
} from '@/types/intelligence';

// ============================================================
// Types for secondary endpoints
// ============================================================

interface DashboardDailyRow {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

interface DashboardResponse {
  metrics: {
    total_spend_micros: number;
    total_clicks: number;
    total_impressions: number;
    total_conversions: number;
    avg_ctr: number;
    avg_cpc_micros: number;
    avg_cpa_micros: number | null;
    active_campaigns: number;
    pending_approvals: number;
  };
  daily: DashboardDailyRow[];
}

interface SetupStatus {
  googleAds: { connected: boolean; customerId: string | null; hasValidToken: boolean };
  ga4: { connected: boolean; propertyId: string | null };
  companyProfile: { configured: boolean };
  dataForSeo: { configured: boolean };
  overall: { stepsComplete: number; stepsTotal: number; ready: boolean };
}

interface VisibilityReport {
  id: string;
  domain: string;
  organic_score: number | null;
  llm_score: number | null;
  target_keywords: string[] | null;
  organic_results: Array<{ keyword: string; brand_position: number | null }> | null;
  llm_results: Array<{ keyword: string; mentioned: boolean; position: number | null }> | null;
  created_at: string;
}

// ============================================================
// Formatters
// ============================================================

const currency0 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const currency2 = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat('en-US');

function fromMicros(micros: number | null | undefined): number {
  return (micros ?? 0) / 1_000_000;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function pctChange(first: number, second: number): number | null {
  if (first === 0) return second === 0 ? 0 : null;
  return ((second - first) / first) * 100;
}

function halfPeriodDelta(
  daily: DashboardDailyRow[],
  key: keyof Omit<DashboardDailyRow, 'date'>,
): number | null {
  if (daily.length < 4) return null;
  const mid = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, mid);
  const secondHalf = daily.slice(mid);
  const avg = (rows: DashboardDailyRow[]) =>
    rows.reduce((sum, r) => sum + (r[key] as number), 0) / rows.length;
  return pctChange(avg(firstHalf), avg(secondHalf));
}

// ============================================================
// Channel Health Strip
// ============================================================

type ChannelStatus = 'healthy' | 'watching' | 'attention' | 'offline';

interface ChannelTileProps {
  label: string;
  icon: React.ReactNode;
  status: ChannelStatus;
  value: string;
  detail: string;
  href?: string;
}

const statusConfig: Record<
  ChannelStatus,
  { ring: string; dot: string; text: string; label: string }
> = {
  healthy: {
    ring: 'ring-success/30',
    dot: 'bg-success',
    text: 'text-success',
    label: 'Healthy',
  },
  watching: {
    ring: 'ring-info/30',
    dot: 'bg-info',
    text: 'text-info',
    label: 'Watching',
  },
  attention: {
    ring: 'ring-warning/30',
    dot: 'bg-warning',
    text: 'text-warning',
    label: 'Needs attention',
  },
  offline: {
    ring: 'ring-border',
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    label: 'Not connected',
  },
};

function ChannelTile({
  label,
  icon,
  status,
  value,
  detail,
  href,
}: ChannelTileProps) {
  const cfg = statusConfig[status];
  const body = (
    <Card
      className={cn(
        'group relative overflow-hidden p-4 ring-1 transition-colors',
        cfg.ring,
        href && 'hover:border-border/80',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {icon}
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
          <span className={cn('text-[10px] font-medium', cfg.text)}>
            {cfg.label}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      {href && (
        <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

// ============================================================
// Recommendation card — top intelligence items rendered richly
// ============================================================

const PATTERN_CATEGORY: Record<string, { label: string; color: string }> = {
  google_ads: { label: 'Ads', color: 'text-info' },
  ga4: { label: 'Analytics', color: 'text-accent' },
  serp: { label: 'SEO', color: 'text-success' },
  llm: { label: 'AEO', color: 'text-warning' },
  system: { label: 'System', color: 'text-muted-foreground' },
};

function pickCategory(item: FeedItem): { label: string; color: string } {
  // Prefer the first non-system source.
  const primary =
    item.dataSources.find((s) => s !== 'system') ?? item.dataSources[0];
  return PATTERN_CATEGORY[primary] ?? PATTERN_CATEGORY.system;
}

function RecommendationCard({ item }: { item: FeedItem }) {
  const { openChat } = useChatPanel();
  const category = pickCategory(item);
  const primaryAction = item.actions[0];
  const severityBadge: Record<
    FeedSeverity,
    'critical' | 'warning' | 'info' | 'success'
  > = {
    critical: 'critical',
    warning: 'warning',
    info: 'info',
    success: 'success',
  };

  return (
    <Card className="group relative overflow-hidden p-5 transition-colors hover:border-border/80">
      {/* Soft accent glow on hover */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/0 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={cn('text-[10px] font-semibold uppercase tracking-wide', category.color)}>
              {category.label}
            </span>
            <span className="text-muted-foreground">·</span>
            <Badge variant={severityBadge[item.severity]}>
              {item.severity === 'critical' && <AlertCircle className="h-3 w-3" />}
              {item.severity === 'warning' && <AlertTriangle className="h-3 w-3" />}
              {item.severity === 'info' && <Sparkles className="h-3 w-3" />}
              {item.severity === 'success' && <CheckCircle className="h-3 w-3" />}
              {item.severity}
            </Badge>
          </div>
          <TimeAgo value={item.timestamp} className="text-[10px]" />
        </div>

        <h3 className="mt-2 text-sm font-semibold leading-tight text-foreground">
          {item.title}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-3">
          {item.story}
        </p>

        {primaryAction && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              size="sm"
              variant="default"
              onClick={
                primaryAction.type === 'chat'
                  ? () => openChat(undefined, primaryAction.chatPrefill)
                  : undefined
              }
              asChild={primaryAction.type !== 'chat'}
            >
              {primaryAction.type === 'chat' ? (
                <>
                  <MessageSquare className="h-3.5 w-3.5" />
                  {primaryAction.label}
                </>
              ) : (
                <Link href={primaryAction.href || '#'}>
                  {primaryAction.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Feed card (chronological stream below recommendations)
// ============================================================

const SEVERITY_CONFIG: Record<
  FeedSeverity,
  { icon: typeof AlertCircle; color: string; stripe: string; label: string }
> = {
  critical: { icon: AlertCircle, color: 'text-critical', stripe: 'bg-critical', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'text-warning', stripe: 'bg-warning', label: 'Warning' },
  info: { icon: Info, color: 'text-info', stripe: 'bg-info', label: 'Info' },
  success: { icon: CheckCircle, color: 'text-success', stripe: 'bg-success', label: 'Healthy' },
};

const SOURCE_LABELS: Record<
  FeedDataSource,
  { label: string; variant: 'info' | 'accent' | 'success' | 'warning' | 'muted' }
> = {
  google_ads: { label: 'Ads', variant: 'info' },
  ga4: { label: 'Analytics', variant: 'accent' },
  serp: { label: 'SEO', variant: 'success' },
  llm: { label: 'AEO', variant: 'warning' },
  system: { label: 'System', variant: 'muted' },
};

function FeedCard({ item }: { item: FeedItem }) {
  const { openChat } = useChatPanel();
  const config = SEVERITY_CONFIG[item.severity];
  const Icon = config.icon;

  return (
    <Card className="group overflow-hidden transition-colors hover:border-border/80">
      <div className="flex">
        <div className={cn('w-1 shrink-0', config.stripe)} aria-hidden="true" />
        <div className="flex-1 p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Icon
                className={cn('mt-0.5 h-4 w-4 shrink-0', config.color)}
                aria-label={config.label}
              />
              <h3 className="text-sm font-semibold leading-tight text-foreground">
                {item.title}
              </h3>
            </div>
            <TimeAgo value={item.timestamp} className="shrink-0 text-[10px]" />
          </div>

          <p className="mb-3 ml-6 text-xs leading-relaxed text-muted-foreground">
            {item.story}
          </p>

          <div className="ml-6 flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {item.dataSources.map((src) => {
                const cfg = SOURCE_LABELS[src];
                return cfg ? (
                  <Badge key={src} variant={cfg.variant}>
                    {cfg.label}
                  </Badge>
                ) : null;
              })}
            </div>

            <div className="flex shrink-0 gap-1">
              {item.actions.map((action, i) =>
                action.type === 'chat' ? (
                  <Button
                    key={i}
                    variant="ghost"
                    size="sm"
                    onClick={() => openChat(undefined, action.chatPrefill)}
                    className="text-info hover:bg-info/10 hover:text-info"
                  >
                    <MessageSquare className="h-3 w-3" />
                    {action.label}
                  </Button>
                ) : (
                  <Button
                    key={i}
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Link href={action.href || '#'}>{action.label}</Link>
                  </Button>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Main Briefing page
// ============================================================

// Shape the Ayn status card consumes. Mirrors /api/optimizer/last-run output.
interface OptimizerLastRun {
  has_run: boolean;
  last_run_at: string | null;
  status: string | null;
  recommendations_generated: number;
  auto_applied: number;
  queued_for_review: number;
  blocked: number;
  errors: number;
  campaigns_processed: number;
  auto_optimize_enabled?: boolean;
  auto_apply_risk_tier?: string;
}

export default function BriefingPage() {
  const [feed, setFeed] = useState<IntelligenceFeedResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [visibility, setVisibility] = useState<VisibilityReport | null>(null);
  const [optimizerRun, setOptimizerRun] = useState<OptimizerLastRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const [feedRes, dashRes, setupRes, visRes, optRes] =
      await Promise.allSettled([
        api.get<IntelligenceFeedResponse>('/api/intelligence'),
        api.get<DashboardResponse>('/api/performance/dashboard?days=30'),
        api.get<SetupStatus>('/api/setup-status'),
        api.get<VisibilityReport[]>('/api/visibility'),
        api.get<OptimizerLastRun>('/api/optimizer/last-run'),
      ]);

    if (feedRes.status === 'fulfilled' && feedRes.value.items) {
      setFeed(feedRes.value);
    }
    if (dashRes.status === 'fulfilled') {
      setDashboard(dashRes.value);
    }
    if (setupRes.status === 'fulfilled') {
      setSetup(setupRes.value);
    }
    if (visRes.status === 'fulfilled') {
      setVisibility(visRes.value[0] ?? null);
    }
    if (optRes.status === 'fulfilled') {
      setOptimizerRun(optRes.value);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchAll(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ---------- Derived display data ----------

  const criticalCount =
    feed?.items.filter((i) => i.severity === 'critical').length ?? 0;
  const warningCount =
    feed?.items.filter((i) => i.severity === 'warning').length ?? 0;

  const headerDescription = (() => {
    if (!feed) return 'Loading insights…';
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (warningCount > 0)
      parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
    if (parts.length === 0) parts.push('All channels operational');
    parts.push(`${feed.items.length} insight${feed.items.length === 1 ? '' : 's'}`);
    return parts.join(' · ');
  })();

  const daily = useMemo(() => dashboard?.daily ?? [], [dashboard]);
  const metrics = dashboard?.metrics;

  const spendSeries = daily.map((d) => ({
    date: formatShortDate(d.date),
    spend: fromMicros(d.spend),
    clicks: d.clicks,
    impressions: d.impressions,
    conversions: d.conversions,
  }));

  const sparkSpend = daily.map((d) => ({ value: fromMicros(d.spend) }));
  const sparkClicks = daily.map((d) => ({ value: d.clicks }));
  const sparkConversions = daily.map((d) => ({ value: d.conversions }));
  const sparkCtr = daily.map((d) => ({
    value: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
  }));

  const deltaSpend = halfPeriodDelta(daily, 'spend');
  const deltaClicks = halfPeriodDelta(daily, 'clicks');
  const deltaConversions = halfPeriodDelta(daily, 'conversions');
  const deltaCtr = (() => {
    if (daily.length < 4) return null;
    const mid = Math.floor(daily.length / 2);
    const compute = (rows: DashboardDailyRow[]) => {
      const clicks = rows.reduce((s, r) => s + r.clicks, 0);
      const impressions = rows.reduce((s, r) => s + r.impressions, 0);
      return impressions > 0 ? (clicks / impressions) * 100 : 0;
    };
    return pctChange(compute(daily.slice(0, mid)), compute(daily.slice(mid)));
  })();

  const ctrPct =
    metrics && metrics.total_impressions > 0
      ? (metrics.total_clicks / metrics.total_impressions) * 100
      : 0;
  const convRatePct =
    metrics && metrics.total_clicks > 0
      ? (metrics.total_conversions / metrics.total_clicks) * 100
      : 0;

  const activityScore = (() => {
    if (daily.length < 14) return 50;
    const last7 = daily.slice(-7);
    const last7Avg = last7.reduce((s, r) => s + fromMicros(r.spend), 0) / 7;
    const overallAvg =
      daily.reduce((s, r) => s + fromMicros(r.spend), 0) / daily.length;
    if (overallAvg === 0) return 0;
    const ratio = last7Avg / overallAvg;
    return Math.max(0, Math.min(100, ratio * 50));
  })();

  const radialMetrics: RadialMetric[] = [
    {
      name: 'CTR',
      value: Math.min(100, ctrPct * 20),
      color: 'var(--info)',
      displayValue: `${ctrPct.toFixed(2)}%`,
    },
    {
      name: 'Conversion rate',
      value: Math.min(100, convRatePct * 20),
      color: 'var(--success)',
      displayValue: `${convRatePct.toFixed(2)}%`,
    },
    {
      name: 'Activity',
      value: activityScore,
      color: 'var(--accent)',
      displayValue:
        activityScore > 55
          ? 'Accelerating'
          : activityScore < 45
            ? 'Cooling'
            : 'Steady',
    },
  ];

  // ---------- Top recommendations (extracted from feed) ----------

  const topRecommendations = (feed?.items ?? [])
    .filter(
      (i) =>
        i.type === 'cross_data_insight' ||
        i.type === 'optimization_opportunity' ||
        i.severity === 'critical' ||
        i.severity === 'warning',
    )
    .sort((a, b) => {
      const sev = (s: FeedSeverity) =>
        s === 'critical' ? 0 : s === 'warning' ? 1 : s === 'info' ? 2 : 3;
      const sevDiff = sev(a.severity) - sev(b.severity);
      if (sevDiff !== 0) return sevDiff;
      return (a.priority ?? 99) - (b.priority ?? 99);
    })
    .slice(0, 3);

  const recommendationIds = new Set(topRecommendations.map((r) => r.id));
  const otherFeedItems = (feed?.items ?? []).filter(
    (i) => !recommendationIds.has(i.id),
  );

  // ---------- Channel health tiles ----------

  const adsHealth = ((): ChannelTileProps => {
    if (!setup?.googleAds.connected) {
      return {
        label: 'Ads',
        icon: <Target className="h-3.5 w-3.5" />,
        status: 'offline',
        value: 'Not connected',
        detail: 'Connect Google Ads to begin',
        href: '/settings/connection',
      };
    }
    const activeCount = metrics?.active_campaigns ?? 0;
    const convs = metrics?.total_conversions ?? 0;
    const status: ChannelStatus =
      activeCount === 0
        ? 'watching'
        : convs === 0
          ? 'attention'
          : deltaConversions !== null && deltaConversions < -20
            ? 'attention'
            : 'healthy';
    return {
      label: 'Ads',
      icon: <Target className="h-3.5 w-3.5" />,
      status,
      value: `${activeCount} active`,
      detail:
        convs > 0
          ? `${numberFmt.format(convs)} conversions · ${currency0.format(fromMicros(metrics?.total_spend_micros))}`
          : 'Awaiting conversions',
      href: '/portfolio',
    };
  })();

  const analyticsHealth = ((): ChannelTileProps => {
    if (!setup?.ga4.connected) {
      return {
        label: 'Analytics',
        icon: <Activity className="h-3.5 w-3.5" />,
        status: 'offline',
        value: 'Not connected',
        detail: 'Add your GA4 property ID',
        href: '/settings',
      };
    }
    return {
      label: 'Analytics',
      icon: <Activity className="h-3.5 w-3.5" />,
      status: 'watching',
      value: 'GA4 linked',
      detail: `Property ${setup.ga4.propertyId}`,
      href: '/visibility/analytics',
    };
  })();

  const seoHealth = ((): ChannelTileProps => {
    if (!visibility || visibility.organic_score === null) {
      return {
        label: 'SEO',
        icon: <Search className="h-3.5 w-3.5" />,
        status: 'offline',
        value: 'Not tracked',
        detail: 'Run your first visibility report',
        href: '/visibility/new',
      };
    }
    const score = visibility.organic_score;
    const ranked =
      visibility.organic_results?.filter(
        (r) => r.brand_position !== null && r.brand_position <= 10,
      ).length ?? 0;
    const total = visibility.target_keywords?.length ?? 0;
    const status: ChannelStatus =
      score >= 70 ? 'healthy' : score >= 40 ? 'watching' : 'attention';
    return {
      label: 'SEO',
      icon: <Search className="h-3.5 w-3.5" />,
      status,
      value: `${Math.round(score)}/100`,
      detail: total > 0 ? `Top-10 for ${ranked}/${total} keywords` : 'Visibility score',
      href: '/visibility',
    };
  })();

  const aeoHealth = ((): ChannelTileProps => {
    if (!visibility || visibility.llm_score === null) {
      return {
        label: 'AEO',
        icon: <Brain className="h-3.5 w-3.5" />,
        status: 'offline',
        value: 'Not tracked',
        detail: 'Answer-engine visibility',
        href: '/visibility/new',
      };
    }
    const score = visibility.llm_score;
    const mentioned =
      visibility.llm_results?.filter((r) => r.mentioned).length ?? 0;
    const total = visibility.llm_results?.length ?? 0;
    const status: ChannelStatus =
      score >= 60 ? 'healthy' : score >= 30 ? 'watching' : 'attention';
    return {
      label: 'AEO',
      icon: <Brain className="h-3.5 w-3.5" />,
      status,
      value: `${Math.round(score)}/100`,
      detail:
        total > 0
          ? `Mentioned in ${mentioned}/${total} queries`
          : 'Brand in AI answers',
      href: '/visibility',
    };
  })();

  // ---------- Ayn status ----------
  // The AI's operational state — replaces the old "Autopilot" framing.
  // Ayn wakes up once every setup step is complete. Token refresh is
  // handled automatically by the backend, so we don't gate on it here.

  const pendingApprovals = metrics?.pending_approvals ?? 0;
  const aynActive =
    !!setup &&
    setup.overall.stepsComplete === setup.overall.stepsTotal;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={<Zap className="h-5 w-5" />}
        title="Intelligence"
        description={headerDescription}
        actions={
          <>
            {feed && (
              <div className="hidden text-[10px] text-muted-foreground md:block">
                Updated <TimeAgo value={feed.generatedAt} />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              aria-label="Refresh intelligence feed"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </>
        }
      />

      {/* Channel Health Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ChannelTile {...adsHealth} />
        <ChannelTile {...analyticsHealth} />
        <ChannelTile {...seoHealth} />
        <ChannelTile {...aeoHealth} />
      </div>

      {/* Top recommendations (intelligence hero) */}
      {!loading && topRecommendations.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">
                Top recommendations
              </h2>
              <Badge variant="accent">
                {topRecommendations.length}
              </Badge>
            </div>
            <Link
              href="/approvals"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {topRecommendations.map((item) => (
              <RecommendationCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Metric cards with sparklines */}
      {loading && !dashboard ? (
        <SkeletonMetricGrid count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total spend (30d)"
            value={currency0.format(fromMicros(metrics?.total_spend_micros ?? 0))}
            icon={<DollarSign className="h-4 w-4" />}
            accent="primary"
            deltaPct={deltaSpend}
            chart={
              sparkSpend.length > 0 && (
                <Sparkline id="spend" data={sparkSpend} color="var(--primary)" />
              )
            }
          />
          <MetricCard
            label="Conversions"
            value={numberFmt.format(metrics?.total_conversions ?? 0)}
            icon={<Target className="h-4 w-4" />}
            accent="success"
            deltaPct={deltaConversions}
            chart={
              sparkConversions.length > 0 && (
                <Sparkline
                  id="conversions"
                  data={sparkConversions}
                  color="var(--success)"
                />
              )
            }
          />
          <MetricCard
            label="Clicks"
            value={numberFmt.format(metrics?.total_clicks ?? 0)}
            icon={<MousePointerClick className="h-4 w-4" />}
            accent="accent"
            deltaPct={deltaClicks}
            chart={
              sparkClicks.length > 0 && (
                <Sparkline id="clicks" data={sparkClicks} color="var(--accent)" />
              )
            }
          />
          <MetricCard
            label="CTR"
            value={`${ctrPct.toFixed(2)}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="warning"
            deltaPct={deltaCtr}
            chart={
              sparkCtr.length > 0 && (
                <Sparkline id="ctr" data={sparkCtr} color="var(--warning)" />
              )
            }
          />
        </div>
      )}

      {/* Spend trajectory + Performance pulse */}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="relative overflow-hidden p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Spend trajectory
                </h2>
                <p className="text-xs text-muted-foreground">
                  Daily ad spend, last 30 days
                </p>
              </div>
              {spendSeries.length > 0 ? (
                <Badge variant="accent">
                  <Activity className="h-3 w-3" />
                  Live
                </Badge>
              ) : (
                <Badge variant="muted">Awaiting data</Badge>
              )}
            </div>
            {spendSeries.length > 0 ? (
              <AreaTrend
                id="briefing-spend"
                data={spendSeries}
                dataKey="spend"
                color="var(--accent)"
                valueFormatter={(v) => currency2.format(v)}
                height={220}
              />
            ) : (
              <div className="relative flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                {/* Decorative curve so the empty state still feels premium */}
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
                  viewBox="0 0 400 220"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="empty-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,180 C60,140 110,160 160,120 C210,80 260,100 310,70 C340,52 370,60 400,40 L400,220 L0,220 Z"
                    fill="url(#empty-grad)"
                  />
                  <path
                    d="M0,180 C60,140 110,160 160,120 C210,80 260,100 310,70 C340,52 370,60 400,40"
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeOpacity="0.6"
                    fill="none"
                  />
                </svg>
                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur-sm">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      No performance data yet
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {setup?.googleAds.connected
                        ? 'Sync Google Ads to populate the 30-day view.'
                        : 'Connect Google Ads to begin tracking performance.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Performance pulse
                </h2>
                <p className="text-xs text-muted-foreground">
                  Normalized KPI health
                </p>
              </div>
              <Gauge className="h-4 w-4 text-muted-foreground" />
            </div>
            {spendSeries.length > 0 ? (
              <PerformanceRadial metrics={radialMetrics} size={180} />
            ) : (
              <div className="flex h-[220px] flex-col items-center justify-center gap-3 text-center">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-border" />
                  <div className="absolute inset-3 rounded-full border border-border/70" />
                  <div className="absolute inset-6 rounded-full border border-border/50" />
                  <Gauge className="relative h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  KPI pulse populates once performance data arrives.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Ayn status — the AI's operational state */}
      <Card
        className={cn(
          'relative overflow-hidden p-5',
          aynActive && 'border-accent/30',
        )}
      >
        {aynActive && (
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent"
            aria-hidden="true"
          />
        )}
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center">
              <AynMark size={44} animated={aynActive} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Ayn
                </h2>
                <Badge variant={aynActive ? 'accent' : 'muted'}>
                  {aynActive ? 'Watching' : 'Standby'}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {aynActive
                  ? 'Reading across Ads, Analytics, SEO, and AEO — surfacing recommendations and queuing actions for your approval.'
                  : `Setup ${setup?.overall.stepsComplete ?? 0}/${setup?.overall.stepsTotal ?? 4} complete — finish configuration to wake Ayn up.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Pending review</span>
                  <span className="font-semibold text-foreground">
                    {pendingApprovals}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Active campaigns</span>
                  <span className="font-semibold text-foreground">
                    {metrics?.active_campaigns ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Insights</span>
                  <span className="font-semibold text-foreground">
                    {feed?.items.length ?? 0}
                  </span>
                </div>
              </div>

              {/* Optimizer run summary — only when Ayn has actually run.
                  Gives the user at-a-glance visibility into what the brain
                  did last round without clicking into /approvals. */}
              {optimizerRun?.has_run && optimizerRun.last_run_at && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-medium text-muted-foreground">
                    Last optimizer run
                  </span>
                  <span className="text-foreground">
                    <TimeAgo value={optimizerRun.last_run_at} />
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono font-semibold text-foreground">
                    {optimizerRun.recommendations_generated}
                  </span>
                  <span className="text-muted-foreground">
                    rec{optimizerRun.recommendations_generated === 1 ? '' : 's'}
                  </span>
                  {optimizerRun.auto_applied > 0 && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <Badge variant="success">
                        {optimizerRun.auto_applied} auto-applied
                      </Badge>
                    </>
                  )}
                  {optimizerRun.queued_for_review > 0 && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <Badge variant="warning">
                        {optimizerRun.queued_for_review} awaiting review
                      </Badge>
                    </>
                  )}
                  {optimizerRun.blocked > 0 && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <Badge variant="muted">
                        {optimizerRun.blocked} blocked by QA
                      </Badge>
                    </>
                  )}
                  {optimizerRun.errors > 0 && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <Badge variant="critical">
                        {optimizerRun.errors} error
                        {optimizerRun.errors === 1 ? '' : 's'}
                      </Badge>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/approvals">
              Review queue
              {pendingApprovals > 0 && (
                <Badge variant="warning" className="ml-1">
                  {pendingApprovals}
                </Badge>
              )}
            </Link>
          </Button>
        </div>
      </Card>

      {/* Intelligence feed (chronological — everything else) */}
      {loading && !feed ? (
        <SkeletonFeed count={4} />
      ) : otherFeedItems.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Intelligence feed
            </h2>
            <span className="text-xs text-muted-foreground">
              · {otherFeedItems.length} item{otherFeedItems.length === 1 ? '' : 's'}
            </span>
          </div>
          {otherFeedItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      ) : feed && feed.items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="h-6 w-6 text-success" />}
          title="All quiet"
          description="No issues detected. Your campaigns are running smoothly."
        />
      ) : null}
    </div>
  );
}
