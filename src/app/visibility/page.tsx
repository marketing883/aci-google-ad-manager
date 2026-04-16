'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Bot,
  DollarSign,
  Eye,
  Globe,
  Loader2,
  MessageSquare,
  Minus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/patterns/EmptyState';
import { MetricCard } from '@/components/patterns/MetricCard';
import { PageHeader } from '@/components/patterns/PageHeader';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface VisibilityReport {
  id: string;
  brand_name: string;
  domain: string;
  overall_score: number;
  organic_score: number;
  ai_overview_score: number;
  llm_score: number;
  paid_score: number;
  target_keywords: string[];
  recommendations: Array<{
    id: string;
    title: string;
    action: string;
    priority: number;
  }>;
  api_cost_cents: number;
  created_at: string;
}

interface AnalyticsSnapshot {
  id: string;
  period_start: string;
  period_end: string;
  traffic: { sessions?: number; users?: number; bounce_rate?: number };
  scores: { website_health?: number };
  flags: Array<{ type: string }>;
  recommendations: Array<{
    id: string;
    title: string;
    action: string;
    priority: number;
  }>;
  created_at: string;
}

// ============================================================
// Score card
// ============================================================

type ScoreTone = 'success' | 'warning' | 'critical' | 'muted';

function scoreTone(score: number | null): ScoreTone {
  if (score === null) return 'muted';
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'critical';
}

const toneBadge: Record<ScoreTone, string> = {
  success: 'border-success/30 text-success',
  warning: 'border-warning/30 text-warning',
  critical: 'border-critical/30 text-critical',
  muted: 'border-border text-muted-foreground',
};

function ScoreCard({
  title,
  score,
  icon: Icon,
  trend,
  subtitle,
  href,
}: {
  title: string;
  score: number | null;
  icon: LucideIcon;
  trend?: number | null;
  subtitle: string;
  href: string;
}) {
  const tone = scoreTone(score);
  const scoreColor =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'critical'
          ? 'text-critical'
          : 'text-muted-foreground';

  return (
    <Link href={href} className="block">
      <Card
        className={cn(
          'p-5 ring-1 ring-inset transition-colors hover:border-border/80',
          tone === 'success' && 'ring-success/20',
          tone === 'warning' && 'ring-warning/20',
          tone === 'critical' && 'ring-critical/20',
          tone === 'muted' && 'ring-border',
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </span>
          </div>
          {trend !== undefined && trend !== null && trend !== 0 && (
            <Badge
              variant={
                trend > 0 ? 'success' : trend < 0 ? 'critical' : 'muted'
              }
              className="normal-case"
            >
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {trend > 0 ? '+' : ''}
              {trend}
            </Badge>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={cn('text-3xl font-semibold tracking-tight', scoreColor)}>
            {score ?? '—'}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </Card>
    </Link>
  );
}

// ============================================================
// Main Visibility page
// ============================================================

export default function VisibilityDashboard() {
  const router = useRouter();
  const [latestReport, setLatestReport] = useState<VisibilityReport | null>(null);
  const [reports, setReports] = useState<VisibilityReport[]>([]);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsRes, snapshotRes] = await Promise.allSettled([
        api.get<VisibilityReport[]>('/api/visibility'),
        api.get<AnalyticsSnapshot | { empty: true }>('/api/analytics/snapshot'),
      ]);

      if (reportsRes.status === 'fulfilled' && Array.isArray(reportsRes.value)) {
        setReports(reportsRes.value);
        setLatestReport(reportsRes.value[0] ?? null);
      }

      if (snapshotRes.status === 'fulfilled') {
        const snap = snapshotRes.value;
        if (snap && !('empty' in snap && snap.empty)) {
          setSnapshot(snap as AnalyticsSnapshot);
        } else {
          // Trigger first snapshot in background; don't await failure
          try {
            await api.post('/api/cron/analytics-snapshot', {}, {
              toastOnError: false,
            });
            const fresh = await api.get<AnalyticsSnapshot | { empty: true }>(
              '/api/analytics/snapshot',
            );
            if (fresh && !('empty' in fresh && fresh.empty)) {
              setSnapshot(fresh as AnalyticsSnapshot);
            }
          } catch {
            /* cron may not be available in dev */
          }
        }
      }
    } catch {
      /* silent — per-section empty states handle the rest */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const prevReport = reports.length > 1 ? reports[1] : null;
  const overallTrend =
    latestReport && prevReport
      ? latestReport.overall_score - prevReport.overall_score
      : null;

  const websiteScore = (snapshot?.scores?.website_health as number | undefined) ?? null;
  const trafficData = snapshot?.traffic;
  const snapshotFlags = snapshot?.flags ?? [];
  const snapshotRecs = snapshot?.recommendations ?? [];

  // Deduplicated recommendations from both sources
  const recommendations = (() => {
    const all = [...(latestReport?.recommendations ?? []), ...snapshotRecs];
    const seen = new Set<string>();
    return all.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Eye className="h-5 w-5" />}
        title="Visibility & intelligence"
        description="Brand visibility, website analytics, and actionable insights across Ads, SEO, and AEO."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              aria-label="Refresh visibility data"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button size="sm" asChild>
              <Link href="/visibility/new">
                <Search className="h-4 w-4" />
                New report
              </Link>
            </Button>
          </>
        }
      />

      {/* Score cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          title="Brand visibility"
          score={latestReport?.overall_score ?? null}
          icon={Eye}
          trend={overallTrend}
          subtitle={
            latestReport
              ? `${latestReport.target_keywords.length} keywords tracked`
              : 'Run your first report'
          }
          href="/visibility/search"
        />
        <ScoreCard
          title="Organic search"
          score={latestReport?.organic_score ?? null}
          icon={Globe}
          trend={
            prevReport
              ? (latestReport?.organic_score ?? 0) - prevReport.organic_score
              : null
          }
          subtitle="Google rankings"
          href="/visibility/search"
        />
        <ScoreCard
          title="AI visibility"
          score={latestReport?.ai_overview_score ?? null}
          icon={Bot}
          trend={
            prevReport
              ? (latestReport?.ai_overview_score ?? 0) -
                prevReport.ai_overview_score
              : null
          }
          subtitle="AI overviews + ChatGPT"
          href="/visibility/search"
        />
        <ScoreCard
          title="Paid search"
          score={latestReport?.paid_score ?? null}
          icon={DollarSign}
          trend={
            prevReport
              ? (latestReport?.paid_score ?? 0) - prevReport.paid_score
              : null
          }
          subtitle="Ad presence vs competitors"
          href="/visibility/search"
        />
      </div>

      {/* Live analytics summary */}
      {snapshot && trafficData && (
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Website health"
            value={`${websiteScore ?? '—'}/100`}
            icon={<BarChart3 className="h-4 w-4" />}
            accent={
              websiteScore === null
                ? 'muted'
                : websiteScore >= 60
                  ? 'success'
                  : websiteScore >= 40
                    ? 'warning'
                    : 'critical'
            }
            deltaPct={null}
          />
          <MetricCard
            label="Sessions (30d)"
            value={trafficData.sessions?.toLocaleString() ?? '—'}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="accent"
            deltaPct={null}
          />
          <MetricCard
            label="Bounce rate"
            value={
              trafficData.bounce_rate
                ? `${(trafficData.bounce_rate * 100).toFixed(1)}%`
                : '—'
            }
            icon={<TrendingDown className="h-4 w-4" />}
            accent={
              trafficData.bounce_rate && trafficData.bounce_rate > 0.5
                ? 'critical'
                : 'success'
            }
            deltaPct={null}
          />
          <Card className="flex items-start gap-3 p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Last updated
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                <TimeAgo value={snapshot.created_at} />
              </p>
              {snapshotFlags.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {snapshotFlags.length} issue
                  {snapshotFlags.length === 1 ? '' : 's'} flagged
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Recommendations + quick links */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">
                Top recommendations
              </h2>
              {recommendations.length > 0 && (
                <Badge variant="accent">{recommendations.length}</Badge>
              )}
            </div>
          </div>

          {recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.slice(0, 5).map((rec, i) => (
                <div
                  key={rec.id}
                  className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      rec.priority === 1
                        ? 'bg-critical/15 text-critical'
                        : rec.priority === 2
                          ? 'bg-warning/15 text-warning'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {rec.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {rec.action}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const msg = encodeURIComponent(
                        `${rec.action} Help me implement this.`,
                      );
                      router.push(`/chat?prefill=${msg}`);
                    }}
                    className="shrink-0 text-info"
                  >
                    <MessageSquare className="h-3 w-3" />
                    Fix
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              bare
              icon={<Search className="h-6 w-6" />}
              title="No recommendations yet"
              description="Run a visibility report to get actionable next steps across SEO, AEO, and paid channels."
              action={
                <Button size="sm" asChild>
                  <Link href="/visibility/new">Run first report</Link>
                </Button>
              }
            />
          )}
        </Card>

        <div className="space-y-3">
          <QuickLink
            href="/visibility/search"
            icon={<Search className="h-4 w-4" />}
            title="Search visibility"
            description="Organic rankings, AI overviews, LLM mentions, paid ads"
            accent="info"
          />
          <QuickLink
            href="/visibility/analytics"
            icon={<BarChart3 className="h-4 w-4" />}
            title="Website analytics"
            description="Traffic, landing pages, conversions, ad-click behavior"
            accent="accent"
          />
          <QuickLink
            href="/visibility/trends"
            icon={<TrendingUp className="h-4 w-4" />}
            title="Trends"
            description="Score changes over time, improvement tracking"
            accent="success"
          />
        </div>
      </div>

      {/* Recent reports */}
      {reports.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Recent reports
            </h2>
          </div>
          <div className="space-y-2">
            {reports.slice(0, 5).map((report) => {
              const tone = scoreTone(report.overall_score);
              return (
                <Link
                  key={report.id}
                  href={`/visibility/${report.id}`}
                  className="group flex items-center justify-between rounded-md border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-bold',
                        toneBadge[tone],
                      )}
                    >
                      {report.overall_score}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {report.brand_name} — {report.domain}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {report.target_keywords.length} keywords ·{' '}
                        <TimeAgo value={report.created_at} />
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {reports.length === 0 && !loading && (
        <EmptyState
          icon={<Eye className="h-6 w-6" />}
          title="No visibility reports yet"
          description="Run your first report to see brand rankings across organic search, AI answers, and paid ads."
          action={
            <Button asChild>
              <Link href="/visibility/new">
                <Search className="h-4 w-4" />
                Run first report
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

// ============================================================
// Quick link card
// ============================================================

function QuickLink({
  href,
  icon,
  title,
  description,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: 'info' | 'accent' | 'success';
}) {
  const accentClass: Record<typeof accent, string> = {
    info: 'bg-info/10 text-info',
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
  };
  return (
    <Link href={href} className="block">
      <Card className="group p-5 transition-colors hover:border-border/80">
        <div className="mb-2 flex items-center gap-3">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md',
              accentClass[accent],
            )}
          >
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          View
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}
