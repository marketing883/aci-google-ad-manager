'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  ExternalLink,
  Loader2,
  MessageSquare,
  MousePointerClick,
  PieChart,
  RefreshCw,
  Search,
  Target,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { EmptyState } from '@/components/patterns/EmptyState';
import { MetricCard } from '@/components/patterns/MetricCard';
import { PageHeader } from '@/components/patterns/PageHeader';
import { SkeletonMetricGrid } from '@/components/patterns/SkeletonFeed';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface CampaignWithStats {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_amount_micros: number;
  bidding_strategy: string;
  created_at: string;
  google_campaign_id: string | null;
  ad_groups_count: number;
  stats?: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
  };
}

// ============================================================
// Health scoring
// ============================================================

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface HealthGrade {
  grade: Grade;
  score: number;
  tone: 'success' | 'info' | 'warning' | 'critical' | 'muted';
  reasons: string[];
}

function gradeTone(score: number): HealthGrade['tone'] {
  if (score >= 80) return 'success';
  if (score >= 60) return 'info';
  if (score >= 40) return 'warning';
  if (score >= 20) return 'critical';
  return 'muted';
}

function calculateHealthGrade(campaign: CampaignWithStats): HealthGrade {
  const reasons: string[] = [];
  let score = 50;
  const stats = campaign.stats;
  if (!stats || stats.impressions === 0) {
    return { grade: 'F', score: 0, tone: 'muted', reasons: ['No performance data'] };
  }
  const ctr = stats.ctr || (stats.impressions > 0 ? stats.clicks / stats.impressions : 0);
  if (ctr >= 0.05) {
    score += 25;
    reasons.push('Excellent CTR (>5%)');
  } else if (ctr >= 0.03) {
    score += 15;
    reasons.push('Good CTR (3-5%)');
  } else if (ctr >= 0.01) {
    score += 5;
    reasons.push('Average CTR (1-3%)');
  } else {
    score -= 10;
    reasons.push('Low CTR (<1%)');
  }
  if (stats.conversions > 0) {
    const cpa = stats.cost_micros / stats.conversions;
    const budget = campaign.budget_amount_micros;
    if (budget <= 0) {
      score += 15;
    } else if (cpa <= budget * 0.5) {
      score += 30;
      reasons.push('Great CPA');
    } else if (cpa <= budget) {
      score += 20;
    } else if (cpa <= budget * 2) {
      score += 5;
    } else {
      score -= 10;
      reasons.push('CPA exceeds 2x budget');
    }
  } else if (stats.cost_micros > 0) {
    score -= 15;
    reasons.push('No conversions');
  }
  if (stats.cost_micros > 0 && stats.clicks > 0) {
    const avgCpc = stats.cost_micros / stats.clicks;
    if (avgCpc <= 2_000_000) score += 15;
    else if (avgCpc <= 5_000_000) score += 10;
  }
  score = Math.max(0, Math.min(100, score));
  let grade: Grade;
  if (score >= 80) grade = 'A';
  else if (score >= 60) grade = 'B';
  else if (score >= 40) grade = 'C';
  else if (score >= 20) grade = 'D';
  else grade = 'F';
  return { grade, score, tone: gradeTone(score), reasons };
}

function getOverallGrade(campaigns: CampaignWithStats[]): HealthGrade {
  const active = campaigns.filter((c) => c.status === 'active' && c.stats);
  if (active.length === 0) {
    return { grade: 'F', score: 0, tone: 'muted', reasons: [] };
  }
  const avgScore =
    active.reduce((s, c) => s + calculateHealthGrade(c).score, 0) / active.length;
  const grade: Grade =
    avgScore >= 80
      ? 'A'
      : avgScore >= 60
        ? 'B'
        : avgScore >= 40
          ? 'C'
          : avgScore >= 20
            ? 'D'
            : 'F';
  return {
    grade,
    score: Math.round(avgScore),
    tone: gradeTone(avgScore),
    reasons: [],
  };
}

function getRecommendation(campaign: CampaignWithStats, health: HealthGrade): string {
  if (!campaign.stats || campaign.stats.impressions === 0)
    return 'No data yet — sync or wait for campaign to start.';
  if (campaign.stats.conversions === 0 && campaign.stats.cost_micros > 5_000_000)
    return 'Spending without conversions. Review keywords or landing page.';
  if (health.grade === 'A') return 'Top performer — consider increasing budget.';
  if (health.grade === 'B') return 'Performing well. Test new ad copy.';
  if (campaign.stats.ctr < 0.01) return 'Low CTR — ad copy needs work.';
  if (health.grade === 'D' || health.grade === 'F')
    return 'Underperforming. Ask AI to investigate.';
  return 'Stable. Monitor for opportunities.';
}

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(micros / 1_000_000);
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'critical' | 'info' | 'accent'> = {
  active: 'success',
  paused: 'warning',
  draft: 'muted',
  removed: 'critical',
  pending_approval: 'accent',
  approved: 'info',
};

const toneClass = {
  success: 'bg-success/10 text-success',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-critical/10 text-critical',
  muted: 'bg-muted text-muted-foreground',
} as const;

// ============================================================
// Campaign card
// ============================================================

function CampaignCard({
  campaign,
  onDelete,
}: {
  campaign: CampaignWithStats;
  onDelete: () => void;
}) {
  const router = useRouter();
  const health = calculateHealthGrade(campaign);
  const recommendation = getRecommendation(campaign, health);
  const stats = campaign.stats;
  const spendPct =
    stats?.cost_micros && campaign.budget_amount_micros > 0
      ? Math.min(
          100,
          Math.round(
            (stats.cost_micros / (campaign.budget_amount_micros * 30)) * 100,
          ),
        )
      : 0;

  const statusVariant = STATUS_VARIANT[campaign.status] ?? 'muted';

  return (
    <Card className="group p-5 transition-colors hover:border-border/80">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/portfolio/${campaign.id}`}
              className="truncate text-sm font-semibold text-foreground hover:text-accent"
            >
              {campaign.name}
            </Link>
            <Badge variant={statusVariant}>{campaign.status}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {campaign.campaign_type} · {fmt(campaign.budget_amount_micros)}/day ·{' '}
            {campaign.ad_groups_count} ad group
            {campaign.ad_groups_count === 1 ? '' : 's'}
          </p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg font-bold',
            toneClass[health.tone],
          )}
          aria-label={`Health grade ${health.grade}`}
        >
          {health.grade}
        </div>
      </div>

      {/* Metric row */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Impressions
          </p>
          <p className="text-sm font-semibold text-foreground">
            {stats?.impressions?.toLocaleString() || '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Clicks
          </p>
          <p className="text-sm font-semibold text-foreground">
            {stats?.clicks?.toLocaleString() || '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            CTR
          </p>
          <p className="text-sm font-semibold text-foreground">
            {stats ? `${((stats.ctr || 0) * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Conv
          </p>
          <p className="text-sm font-semibold text-foreground">
            {stats ? stats.conversions : '—'}
          </p>
        </div>
      </div>

      {/* Spend bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">
            Spend: {stats ? fmt(stats.cost_micros) : '$0'}
          </span>
          <span className="font-mono font-semibold text-foreground">
            {spendPct}% utilized
          </span>
        </div>
        <Progress value={spendPct} />
      </div>

      {/* Recommendation */}
      <div className="mb-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {recommendation}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/portfolio/${campaign.id}`}>
              View details
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const msg = encodeURIComponent(
                `Analyze the campaign "${campaign.name}" — what's working, what's not, and what should I change?`,
              );
              router.push(`/chat?prefill=${msg}`);
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>
          {campaign.google_campaign_id && (
            <Button variant="ghost" size="sm" asChild>
              <a
                href={`https://ads.google.com/aw/campaigns?campaignId=${campaign.google_campaign_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Google Ads
              </a>
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="h-7 w-7 text-muted-foreground hover:text-critical"
          aria-label={`Delete ${campaign.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

// ============================================================
// Main page
// ============================================================

export default function PortfolioPage() {
  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'draft'>(
    'all',
  );
  const [sortBy, setSortBy] = useState<
    'health' | 'spend' | 'conversions' | 'name'
  >('health');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<CampaignWithStats[]>(
        '/api/campaigns?status=all',
      );
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/campaigns/${deleteTarget.id}?hard=true`);
      toast.success(`Deleted "${deleteTarget.name}"`);
      fetchCampaigns();
    } catch {
      /* api-client toast */
    } finally {
      setDeleteTarget(null);
    }
  }

  const filtered = campaigns.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'health':
        return calculateHealthGrade(b).score - calculateHealthGrade(a).score;
      case 'spend':
        return (b.stats?.cost_micros || 0) - (a.stats?.cost_micros || 0);
      case 'conversions':
        return (b.stats?.conversions || 0) - (a.stats?.conversions || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  const metrics = useMemo(() => {
    const total_spend = campaigns.reduce(
      (s, c) => s + (c.stats?.cost_micros || 0),
      0,
    );
    const total_conversions = campaigns.reduce(
      (s, c) => s + (c.stats?.conversions || 0),
      0,
    );
    const total_clicks = campaigns.reduce(
      (s, c) => s + (c.stats?.clicks || 0),
      0,
    );
    const total_impressions = campaigns.reduce(
      (s, c) => s + (c.stats?.impressions || 0),
      0,
    );
    const avg_cpa = total_conversions > 0 ? total_spend / total_conversions : null;
    const avg_ctr = total_impressions > 0 ? total_clicks / total_impressions : 0;
    const active_count = campaigns.filter((c) => c.status === 'active').length;
    return {
      total_spend,
      total_conversions,
      total_clicks,
      total_impressions,
      avg_cpa,
      avg_ctr,
      campaign_count: campaigns.length,
      active_count,
    };
  }, [campaigns]);

  const overallGrade = getOverallGrade(campaigns);
  const wastedSpend = campaigns
    .filter((c) => c.stats && c.stats.cost_micros > 0 && c.stats.conversions === 0)
    .reduce((s, c) => s + (c.stats?.cost_micros || 0), 0);
  const spendByCampaign = campaigns
    .filter((c) => c.stats && c.stats.cost_micros > 0)
    .sort((a, b) => (b.stats?.cost_micros || 0) - (a.stats?.cost_micros || 0));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<PieChart className="h-5 w-5" />}
        title="Portfolio"
        description="Campaign health, budget flow, and management."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCampaigns}
            disabled={loading}
            aria-label="Refresh campaigns"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        }
      />

      {/* Overview metrics */}
      {loading && campaigns.length === 0 ? (
        <SkeletonMetricGrid count={4} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex items-center gap-4 p-5">
            <div
              className={cn(
                'flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-3xl font-bold',
                toneClass[overallGrade.tone],
              )}
            >
              {overallGrade.grade}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Portfolio health
              </p>
              <p className="mt-0.5 text-xl font-semibold text-foreground">
                {overallGrade.score}/100
              </p>
              <p className="text-xs text-muted-foreground">
                {metrics.active_count} active of {metrics.campaign_count}
              </p>
            </div>
          </Card>
          <MetricCard
            label="Total spend (30d)"
            value={fmt(metrics.total_spend)}
            icon={<DollarSign className="h-4 w-4" />}
            accent="primary"
            deltaPct={null}
          />
          <MetricCard
            label="Conversions"
            value={metrics.total_conversions.toFixed(1)}
            icon={<Target className="h-4 w-4" />}
            accent="success"
            deltaPct={null}
          />
          <MetricCard
            label="Avg CTR"
            value={`${(metrics.avg_ctr * 100).toFixed(2)}%`}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="accent"
            deltaPct={null}
          />
        </div>
      )}

      {/* Wasted spend callout */}
      {wastedSpend > 0 && (
        <Card className="border-critical/30 bg-critical/5">
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-critical/15 text-critical">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {fmt(wastedSpend)} spent without conversions
              </p>
              <p className="text-xs text-muted-foreground">
                Campaigns with zero returns — review landing pages or pause.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Budget flow */}
      {spendByCampaign.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Budget flow
            </h2>
            <span className="text-xs text-muted-foreground">
              · spend distribution across campaigns
            </span>
          </div>
          <div className="space-y-2">
            {spendByCampaign.map((c) => {
              const pct =
                metrics.total_spend > 0
                  ? (c.stats!.cost_micros / metrics.total_spend) * 100
                  : 0;
              const hasConv = (c.stats?.conversions || 0) > 0;
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="w-40 truncate text-xs text-muted-foreground">
                    {c.name}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'flex h-5 items-center rounded-full px-2',
                        hasConv ? 'bg-info/60' : 'bg-critical/40',
                      )}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    >
                      <span className="whitespace-nowrap text-[10px] font-medium text-foreground">
                        {fmt(c.stats!.cost_micros)} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                  <span className="w-16 text-right text-xs text-foreground">
                    {c.stats?.conversions || 0} conv
                  </span>
                  {!hasConv && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-critical" />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search campaigns…"
              className="h-8 w-56 pl-8"
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">
                All ({campaigns.length})
              </TabsTrigger>
              <TabsTrigger value="active">
                Active ({campaigns.filter((c) => c.status === 'active').length})
              </TabsTrigger>
              <TabsTrigger value="paused">
                Paused ({campaigns.filter((c) => c.status === 'paused').length})
              </TabsTrigger>
              <TabsTrigger value="draft">
                Draft ({campaigns.filter((c) => c.status === 'draft').length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health">Health</SelectItem>
              <SelectItem value="spend">Spend</SelectItem>
              <SelectItem value="conversions">Conversions</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Campaign cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onDelete={() => setDeleteTarget({ id: c.id, name: c.name })}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<PieChart className="h-6 w-6" />}
          title="No campaigns yet"
          description="Tell the AI to create your first campaign — describe your goals in plain English."
          action={
            <Button asChild>
              <Link href="/chat">
                <MessageSquare className="h-4 w-4" />
                Open AI chat
              </Link>
            </Button>
          }
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This permanently removes the campaign and all its ad groups, ads, and keywords. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
