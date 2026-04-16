'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AreaTrend } from '@/components/charts/AreaTrend';
import {
  ActivityTimeline,
  type ActivityEntry,
} from '@/components/patterns/ActivityTimeline';
import {
  AiSuggestDialog,
  type SuggestContentType,
} from '@/components/patterns/AiSuggestDialog';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import {
  EditableItemList,
  type EditableItem,
} from '@/components/patterns/EditableItemList';
import { EmptyState } from '@/components/patterns/EmptyState';
import { MetricCard } from '@/components/patterns/MetricCard';
import { PageHeader } from '@/components/patterns/PageHeader';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface AdData {
  id: string;
  ad_group_id: string;
  headlines: Array<{ text: string; pinned_position?: number | null }>;
  descriptions: Array<{ text: string; pinned_position?: number | null }>;
  final_urls: string[];
  status: string;
}

interface KeywordData {
  id: string;
  text: string;
  match_type: string;
  status: string;
}

interface NegativeKeyword {
  id?: string;
  keyword_text?: string;
  text?: string;
  match_type?: string;
}

interface AdGroupData {
  id: string;
  name: string;
  status: string;
  cpc_bid_micros: number;
  ads: AdData[];
  keywords: KeywordData[];
  negative_keywords: NegativeKeyword[];
}

interface PerformanceSnapshot {
  date: string;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  conversion_value_micros?: number | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_amount_micros: number;
  bidding_strategy: string;
  created_at: string;
  google_campaign_id: string | null;
  last_synced_at: string | null;
  targets: Record<string, unknown>;
  ad_groups: AdGroupData[];
  negative_keywords: NegativeKeyword[];
  performance?: PerformanceSnapshot[];
}

type PerfMetric = 'cost' | 'clicks' | 'impressions' | 'conversions';

// ============================================================
// InlineUrlEditor — click-to-edit landing page URL on the ad header.
// Shows the URL as a link by default; click the pencil to swap to an
// input, save on Enter / blur, cancel on Escape.
// ============================================================

function InlineUrlEditor({
  url,
  onSave,
}: {
  url: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(url);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setValue(url);
  }, [url]);

  async function commit() {
    if (value === url) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      await onSave(value.trim());
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue(url);
              setEditing(false);
            }
          }}
          autoFocus
          disabled={pending}
          placeholder="https://example.com/landing-page"
          className="h-6 w-[26rem] text-[11px]"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={pending}
          aria-label="Save URL"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3 text-success" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            setValue(url);
            setEditing(false);
          }}
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </Button>
      </form>
    );
  }

  return (
    <div className="group/url inline-flex items-center gap-1.5">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[30rem] truncate text-[10px] text-muted-foreground hover:text-accent"
        >
          {url}
        </a>
      ) : (
        <span className="text-[10px] italic text-muted-foreground">
          No landing page set
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/url:opacity-100"
        aria-label="Edit landing page URL"
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

const METRIC_CONFIG: Record<
  PerfMetric,
  { label: string; color: string; format: (v: number) => string }
> = {
  cost: {
    label: 'Spend',
    color: 'var(--primary)',
    format: (v) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(v),
  },
  clicks: {
    label: 'Clicks',
    color: 'var(--accent)',
    format: (v) => v.toLocaleString(),
  },
  impressions: {
    label: 'Impressions',
    color: 'var(--info)',
    format: (v) => v.toLocaleString(),
  },
  conversions: {
    label: 'Conversions',
    color: 'var(--success)',
    format: (v) => v.toFixed(1),
  },
};

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STATUS_VARIANT: Record<
  string,
  'success' | 'warning' | 'muted' | 'critical' | 'info' | 'accent'
> = {
  active: 'success',
  paused: 'warning',
  draft: 'muted',
  removed: 'critical',
  pending_approval: 'accent',
  approved: 'info',
};

function fmt(micros: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(micros / 1_000_000);
}

// ============================================================
// Campaign Detail Page
// ============================================================

interface LogEntry {
  id: string;
  agent_name: string;
  action: string;
  output_summary: string | null;
  status: string;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [perfMetric, setPerfMetric] = useState<PerfMetric>('cost');

  // AI suggest dialog state — supports both "add" (bulk new items) and
  // "rewrite" (variations of a single existing item, one-click replace)
  const [aiDialog, setAiDialog] = useState<{
    type: SuggestContentType;
    mode: 'add' | 'rewrite';
    currentText?: string;
    context: string;
    existing: string[];
    onAccept: (text: string) => Promise<void>;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'campaign' | 'ad_group' | 'ad';
    id: string;
    name: string;
    parentId?: string;
  } | null>(null);

  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch per-campaign logs via the entity filter added in migration 009.
      // Falls back gracefully if no entity-scoped logs exist yet — the
      // ActivityTimeline renders its own empty state.
      const [campaignRes, logsRes] = await Promise.allSettled([
        api.get<CampaignDetail>(`/api/campaigns/${id}`),
        api.get<LogEntry[]>(
          `/api/logs?entity_type=campaign&entity_id=${id}&limit=25`,
        ),
      ]);
      if (campaignRes.status === 'fulfilled') {
        setCampaign(campaignRes.value);
      } else {
        setCampaign(null);
      }
      if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) {
        // Convert agent logs into ActivityEntry format
        setActivity(
          logsRes.value.slice(0, 10).map((log) => ({
            id: log.id,
            kind:
              log.status === 'error'
                ? 'error'
                : log.action?.includes('user')
                  ? 'user_edit'
                  : log.agent_name
                    ? 'ai_decision'
                    : 'action',
            title: log.action?.replace(/_/g, ' ') ?? 'Agent action',
            description: log.output_summary ?? undefined,
            timestamp: log.created_at,
            actor: log.agent_name ?? 'System',
            status: log.status,
          })),
        );
      }
    } catch {
      setCampaign(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // ============================================================
  // Mutation handlers — keywords / negative keywords / ad items
  // All handlers refetch the campaign on success so the UI stays
  // consistent with the server. Errors are surfaced by api-client
  // via sonner toast and re-thrown so EditableItemList can reset its
  // internal pending state.
  // ============================================================

  async function addKeyword(agId: string, text: string) {
    await api.post(`/api/campaigns/${id}/ad-groups/${agId}/keywords`, {
      text,
      match_type: 'BROAD',
    });
    toast.success('Keyword added');
    await fetchCampaign();
  }

  async function editKeyword(agId: string, kwId: string, text: string) {
    await api.patch(
      `/api/campaigns/${id}/ad-groups/${agId}/keywords/${kwId}`,
      { text },
    );
    await fetchCampaign();
  }

  async function deleteKeyword(agId: string, kwId: string) {
    await api.delete(
      `/api/campaigns/${id}/ad-groups/${agId}/keywords/${kwId}?hard=true`,
    );
    await fetchCampaign();
  }

  async function addNegativeKeyword(
    level: 'campaign' | 'ad_group',
    text: string,
    adGroupId?: string,
  ) {
    await api.post(`/api/campaigns/${id}/negative-keywords`, {
      text,
      match_type: 'PHRASE',
      level,
      ad_group_id: adGroupId,
    });
    toast.success('Negative keyword added');
    await fetchCampaign();
  }

  async function deleteNegativeKeyword(nkId: string) {
    await api.delete(`/api/campaigns/${id}/negative-keywords/${nkId}`);
    await fetchCampaign();
  }

  /**
   * Update an ad's headlines or descriptions JSONB array. Works for add /
   * edit / delete via a single patch-the-whole-array model — simpler than
   * per-item CRUD and matches the storage shape.
   */
  async function updateAdItems(
    agId: string,
    adId: string,
    field: 'headlines' | 'descriptions',
    next: string[],
  ) {
    await api.patch(
      `/api/campaigns/${id}/ad-groups/${agId}/ads/${adId}`,
      { [field]: next },
    );
    await fetchCampaign();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    let url = '';
    if (deleteTarget.type === 'campaign') {
      url = `/api/campaigns/${id}?hard=true`;
    } else if (deleteTarget.type === 'ad_group') {
      url = `/api/campaigns/${id}/ad-groups/${deleteTarget.id}?hard=true`;
    } else if (deleteTarget.type === 'ad') {
      url = `/api/campaigns/${id}/ad-groups/${deleteTarget.parentId}/ads/${deleteTarget.id}?hard=true`;
    }
    try {
      await api.delete(url);
      toast.success(
        `Deleted ${deleteTarget.type.replace('_', ' ')} "${deleteTarget.name}"`,
      );
      if (deleteTarget.type === 'campaign') {
        router.push('/portfolio');
      } else {
        setSelectedGroup(null);
        fetchCampaign();
      }
    } catch {
      /* api-client toast */
    } finally {
      setDeleteTarget(null);
    }
  }

  const selectedAdGroup = campaign?.ad_groups?.find(
    (ag) => ag.id === selectedGroup,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="Campaign not found"
        description="This campaign doesn't exist or may have been removed."
        action={
          <Button variant="outline" asChild>
            <Link href="/portfolio">
              <ArrowLeft className="h-4 w-4" />
              Back to portfolio
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={
          <Button variant="ghost" size="icon" asChild className="h-9 w-9">
            <Link href="/portfolio" aria-label="Back to portfolio">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[campaign.status] ?? 'muted'}>
              {campaign.status}
            </Badge>
            <span>·</span>
            <span>{campaign.campaign_type}</span>
            <span>·</span>
            <span>{fmt(campaign.budget_amount_micros)}/day</span>
            <span>·</span>
            <span>{campaign.bidding_strategy}</span>
            {campaign.google_campaign_id && (
              <>
                <span>·</span>
                <a
                  href={`https://ads.google.com/aw/campaigns?campaignId=${campaign.google_campaign_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Google Ads
                </a>
              </>
            )}
            {campaign.last_synced_at && (
              <>
                <span>·</span>
                <span className="text-muted-foreground">
                  synced <TimeAgo value={campaign.last_synced_at} />
                </span>
              </>
            )}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCampaign}
              aria-label="Refresh campaign"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const msg = encodeURIComponent(
                  `Analyze the campaign "${campaign.name}" — what's working, what's not, and what should I change?`,
                );
                router.push(`/chat?prefill=${msg}`);
              }}
            >
              <MessageSquare className="h-4 w-4" />
              Edit in chat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setDeleteTarget({
                  type: 'campaign',
                  id: campaign.id,
                  name: campaign.name,
                })
              }
              className="text-critical hover:text-critical"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      {/* Performance chart + metric totals */}
      {(() => {
        const perf = campaign.performance ?? [];
        if (perf.length === 0) {
          return (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Performance
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Daily metrics over the last 30 days
                  </p>
                </div>
                <Badge variant="muted">Awaiting data</Badge>
              </div>
              <div className="relative flex h-[200px] flex-col items-center justify-center gap-2 text-center">
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
                  viewBox="0 0 400 200"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient
                      id="perf-empty-grad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--primary)"
                        stopOpacity="0.4"
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--primary)"
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,160 C50,130 100,150 150,110 C200,80 250,100 300,60 C330,45 370,55 400,30 L400,200 L0,200 Z"
                    fill="url(#perf-empty-grad)"
                  />
                  <path
                    d="M0,160 C50,130 100,150 150,110 C200,80 250,100 300,60 C330,45 370,55 400,30"
                    stroke="var(--primary)"
                    strokeWidth="1.5"
                    strokeOpacity="0.5"
                    fill="none"
                  />
                </svg>
                <p className="relative z-10 text-sm font-medium text-foreground">
                  No performance snapshots yet
                </p>
                <p className="relative z-10 text-xs text-muted-foreground">
                  Data appears once Google Ads starts syncing this campaign.
                </p>
              </div>
            </Card>
          );
        }

        // Aggregate totals
        const totals = perf.reduce(
          (acc, p) => ({
            cost: acc.cost + (p.cost_micros || 0) / 1_000_000,
            clicks: acc.clicks + (p.clicks || 0),
            impressions: acc.impressions + (p.impressions || 0),
            conversions: acc.conversions + (p.conversions || 0),
          }),
          { cost: 0, clicks: 0, impressions: 0, conversions: 0 },
        );

        // Chart series
        const series = perf.map((p) => ({
          date: formatShortDate(p.date),
          cost: (p.cost_micros || 0) / 1_000_000,
          clicks: p.clicks || 0,
          impressions: p.impressions || 0,
          conversions: p.conversions || 0,
        }));

        const ctr =
          totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
        const cpa =
          totals.conversions > 0 ? totals.cost / totals.conversions : null;
        const activeMetric = METRIC_CONFIG[perfMetric];

        return (
          <div className="space-y-4">
            {/* Metric totals row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Spend (30d)"
                value={METRIC_CONFIG.cost.format(totals.cost)}
                accent="primary"
                deltaPct={null}
              />
              <MetricCard
                label="Conversions"
                value={totals.conversions.toFixed(1)}
                accent="success"
                deltaPct={null}
              />
              <MetricCard
                label="CTR"
                value={`${ctr.toFixed(2)}%`}
                accent="accent"
                deltaPct={null}
              />
              <MetricCard
                label="CPA"
                value={cpa === null ? '—' : METRIC_CONFIG.cost.format(cpa)}
                accent="warning"
                deltaPct={null}
              />
            </div>

            {/* Performance chart with metric toggle */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Performance
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {activeMetric.label} over the last {perf.length} days
                  </p>
                </div>
                <Tabs
                  value={perfMetric}
                  onValueChange={(v) => setPerfMetric(v as PerfMetric)}
                >
                  <TabsList>
                    <TabsTrigger value="cost">Spend</TabsTrigger>
                    <TabsTrigger value="clicks">Clicks</TabsTrigger>
                    <TabsTrigger value="impressions">Impressions</TabsTrigger>
                    <TabsTrigger value="conversions">Conversions</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <AreaTrend
                id={`campaign-perf-${perfMetric}`}
                data={series}
                dataKey={perfMetric}
                color={activeMetric.color}
                valueFormatter={activeMetric.format}
                height={240}
              />
            </Card>
          </div>
        );
      })()}

      {/* Campaign-level negative keywords — always visible, even when empty */}
      <Card className="p-4">
        <EditableItemList
          title="Campaign-level negative keywords"
          icon={<Ban className="h-3.5 w-3.5 text-critical" />}
          itemLabel="negative keyword"
          items={(campaign.negative_keywords ?? []).map((nk, i) => ({
            id: nk.id ?? `camp-nk-${i}`,
            text: nk.keyword_text ?? nk.text ?? '',
          }))}
          layout="badges"
          badgeVariantFor={() => 'critical'}
          placeholder="e.g. free, jobs, careers"
          onAdd={(text) => addNegativeKeyword('campaign', text)}
          onEdit={async () => {
            toast.info(
              'To change a negative keyword, delete it and add the new version.',
            );
          }}
          onDelete={async (item) => {
            if (item.id.startsWith('camp-nk-')) return;
            await deleteNegativeKeyword(item.id);
          }}
          onAiSuggest={() =>
            setAiDialog({
              type: 'negative_keyword',
              mode: 'add',
              context: `Campaign: ${campaign.name}\nType: ${campaign.campaign_type}\nStrategy: ${campaign.bidding_strategy}`,
              existing: (campaign.negative_keywords ?? []).map(
                (nk) => nk.keyword_text ?? nk.text ?? '',
              ),
              onAccept: (text) => addNegativeKeyword('campaign', text),
            })
          }
        />
      </Card>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ad groups list */}
        <div className="space-y-3 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ad groups ({campaign.ad_groups?.length || 0})
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const msg = encodeURIComponent(
                  `Add a new ad group to campaign "${campaign.name}" (campaign ID: ${campaign.id}). Ask me what theme and keywords.`,
                );
                router.push(`/chat?prefill=${msg}`);
              }}
              className="h-7 text-accent"
            >
              <Plus className="h-3 w-3" />
              Add via chat
            </Button>
          </div>

          {campaign.ad_groups?.length > 0 ? (
            <div className="space-y-2">
              {campaign.ad_groups.map((ag) => (
                <button
                  key={ag.id}
                  onClick={() => setSelectedGroup(ag.id)}
                  className="block w-full text-left"
                  aria-pressed={selectedGroup === ag.id}
                >
                  <Card
                    className={cn(
                      'cursor-pointer p-4 transition-colors',
                      selectedGroup === ag.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'hover:border-border/80',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Tag className="h-4 w-4 shrink-0 text-accent" />
                        <span className="truncate text-sm font-medium text-foreground">
                          {ag.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant={STATUS_VARIANT[ag.status] ?? 'muted'}>
                          {ag.status}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{ag.keywords?.length || 0} keywords</span>
                      <span>·</span>
                      <span>{ag.ads?.length || 0} ads</span>
                      {ag.cpc_bid_micros > 0 && (
                        <>
                          <span>·</span>
                          <span>{fmt(ag.cpc_bid_micros)} CPC</span>
                        </>
                      )}
                    </div>
                  </Card>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              bare
              icon={<Tag className="h-5 w-5" />}
              title="No ad groups"
              description="This campaign has no ad groups yet."
              className="py-8"
            />
          )}
        </div>

        {/* Selected ad group detail */}
        <div className="lg:col-span-2">
          {selectedAdGroup ? (
            <div className="space-y-4">
              {/* Ad group header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {selectedAdGroup.name}
                    </h2>
                    <Badge
                      variant={STATUS_VARIANT[selectedAdGroup.status] ?? 'muted'}
                    >
                      {selectedAdGroup.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedAdGroup.keywords?.length || 0} keywords ·{' '}
                    {selectedAdGroup.ads?.length || 0} ads
                    {selectedAdGroup.cpc_bid_micros > 0 &&
                      ` · ${fmt(selectedAdGroup.cpc_bid_micros)} CPC bid`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const msg = encodeURIComponent(
                        `Edit the ad group "${selectedAdGroup.name}" in campaign "${campaign.name}". What would you like to change?`,
                      );
                      router.push(`/chat?prefill=${msg}`);
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Edit in chat
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDeleteTarget({
                        type: 'ad_group',
                        id: selectedAdGroup.id,
                        name: selectedAdGroup.name,
                      })
                    }
                    className="text-critical hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete group
                  </Button>
                </div>
              </div>

              {/* Keywords — always visible, inline CRUD + AI suggest */}
              <Card className="p-4">
                <EditableItemList
                  title="Keywords"
                  icon={<Tag className="h-3.5 w-3.5 text-accent" />}
                  itemLabel="keyword"
                  items={(selectedAdGroup.keywords ?? []).map((kw) => ({
                    id: kw.id,
                    text: kw.text,
                    extra: kw.match_type,
                  }))}
                  layout="badges"
                  showCount
                  placeholder="e.g. dynamics 365 consulting"
                  badgeVariantFor={(item) => {
                    const mt = item.extra as string;
                    return mt === 'EXACT'
                      ? 'info'
                      : mt === 'PHRASE'
                        ? 'accent'
                        : 'muted';
                  }}
                  renderBadgeText={(item) => {
                    const mt = item.extra as string;
                    return mt === 'EXACT'
                      ? `[${item.text}]`
                      : mt === 'PHRASE'
                        ? `"${item.text}"`
                        : item.text;
                  }}
                  onAdd={(text) => addKeyword(selectedAdGroup.id, text)}
                  onEdit={(item, text) =>
                    editKeyword(selectedAdGroup.id, item.id, text)
                  }
                  onDelete={(item) =>
                    deleteKeyword(selectedAdGroup.id, item.id)
                  }
                  onAiSuggest={() =>
                    setAiDialog({
                      type: 'keyword',
                      mode: 'add',
                      context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}\nType: ${campaign.campaign_type}`,
                      existing: (selectedAdGroup.keywords ?? []).map(
                        (k) => k.text,
                      ),
                      onAccept: (text) => addKeyword(selectedAdGroup.id, text),
                    })
                  }
                  onAiRewriteItem={(item) =>
                    setAiDialog({
                      type: 'keyword',
                      mode: 'rewrite',
                      currentText: item.text,
                      context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}\nType: ${campaign.campaign_type}`,
                      existing: (selectedAdGroup.keywords ?? []).map(
                        (k) => k.text,
                      ),
                      onAccept: async (text) => {
                        await editKeyword(selectedAdGroup.id, item.id, text);
                      },
                    })
                  }
                />
              </Card>

              {/* Ad-group-level negative keywords — always visible */}
              <Card className="p-4">
                <EditableItemList
                  title="Ad-group negative keywords"
                  icon={<Ban className="h-3.5 w-3.5 text-critical" />}
                  itemLabel="negative keyword"
                  items={(selectedAdGroup.negative_keywords ?? []).map(
                    (nk, i) => ({
                      id: nk.id ?? `ag-nk-${i}`,
                      text: nk.keyword_text ?? nk.text ?? '',
                    }),
                  )}
                  layout="badges"
                  placeholder="e.g. free, tutorial, jobs"
                  badgeVariantFor={() => 'critical'}
                  onAdd={(text) =>
                    addNegativeKeyword('ad_group', text, selectedAdGroup.id)
                  }
                  onEdit={async () => {
                    toast.info(
                      'To change a negative keyword, delete it and add the new version.',
                    );
                  }}
                  onDelete={async (item) => {
                    if (item.id.startsWith('ag-nk-')) return;
                    await deleteNegativeKeyword(item.id);
                  }}
                  onAiSuggest={() =>
                    setAiDialog({
                      type: 'negative_keyword',
                      mode: 'add',
                      context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}`,
                      existing: (selectedAdGroup.negative_keywords ?? []).map(
                        (nk) => nk.keyword_text ?? nk.text ?? '',
                      ),
                      onAccept: (text) =>
                        addNegativeKeyword('ad_group', text, selectedAdGroup.id),
                    })
                  }
                />
              </Card>

              {/* Ads — each ad has inline-editable headlines + descriptions */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ads ({selectedAdGroup.ads?.length || 0})
                </p>
                {selectedAdGroup.ads?.length > 0 ? (
                  <div className="space-y-3">
                    {selectedAdGroup.ads.map((ad) => {
                      const headlineItems: EditableItem[] = (
                        ad.headlines ?? []
                      ).map((h, i) => ({
                        id: `h-${ad.id}-${i}`,
                        text: h.text,
                      }));
                      const descriptionItems: EditableItem[] = (
                        ad.descriptions ?? []
                      ).map((d, i) => ({
                        id: `d-${ad.id}-${i}`,
                        text: d.text,
                      }));

                      const currentHeadlines = (ad.headlines ?? []).map(
                        (h) => h.text,
                      );
                      const currentDescriptions = (ad.descriptions ?? []).map(
                        (d) => d.text,
                      );

                      return (
                        <Card key={ad.id} className="p-4">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-accent" />
                              <Badge
                                variant={STATUS_VARIANT[ad.status] ?? 'muted'}
                              >
                                {ad.status}
                              </Badge>
                              <InlineUrlEditor
                                url={ad.final_urls?.[0] ?? ''}
                                onSave={async (next) => {
                                  await api.patch(
                                    `/api/campaigns/${id}/ad-groups/${selectedAdGroup.id}/ads/${ad.id}`,
                                    { final_urls: next ? [next] : [] },
                                  );
                                  toast.success('Landing page updated');
                                  await fetchCampaign();
                                }}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setDeleteTarget({
                                  type: 'ad',
                                  id: ad.id,
                                  name: ad.headlines?.[0]?.text || 'Ad',
                                  parentId: selectedAdGroup.id,
                                })
                              }
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-critical"
                              aria-label="Delete ad"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>

                          <EditableItemList
                            title="Headlines"
                            icon={<Type className="h-3.5 w-3.5 text-info" />}
                            itemLabel="headline"
                            items={headlineItems}
                            layout="lines"
                            maxLength={30}
                            maxItems={15}
                            showCount
                            placeholder="New headline (max 30 chars)"
                            onAdd={async (text) => {
                              const next = [...currentHeadlines, text];
                              await updateAdItems(
                                selectedAdGroup.id,
                                ad.id,
                                'headlines',
                                next,
                              );
                            }}
                            onEdit={async (item, newText) => {
                              const idx = parseInt(item.id.split('-').pop() ?? '0');
                              const next = [...currentHeadlines];
                              next[idx] = newText;
                              await updateAdItems(
                                selectedAdGroup.id,
                                ad.id,
                                'headlines',
                                next,
                              );
                            }}
                            onDelete={async (item) => {
                              const idx = parseInt(item.id.split('-').pop() ?? '0');
                              const next = currentHeadlines.filter(
                                (_, i) => i !== idx,
                              );
                              await updateAdItems(
                                selectedAdGroup.id,
                                ad.id,
                                'headlines',
                                next,
                              );
                            }}
                            onAiSuggest={() =>
                              setAiDialog({
                                type: 'headline',
                                mode: 'add',
                                context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}\nExisting descriptions: ${currentDescriptions.join(' | ') || '(none)'}`,
                                existing: currentHeadlines,
                                onAccept: async (text) => {
                                  const next = [
                                    ...(ad.headlines ?? []).map((h) => h.text),
                                    text,
                                  ];
                                  await updateAdItems(
                                    selectedAdGroup.id,
                                    ad.id,
                                    'headlines',
                                    next,
                                  );
                                },
                              })
                            }
                            onAiRewriteItem={(item) => {
                              const idx = parseInt(
                                item.id.split('-').pop() ?? '0',
                              );
                              setAiDialog({
                                type: 'headline',
                                mode: 'rewrite',
                                currentText: item.text,
                                context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}\nExisting descriptions: ${currentDescriptions.join(' | ') || '(none)'}`,
                                existing: currentHeadlines,
                                onAccept: async (text) => {
                                  const next = [...currentHeadlines];
                                  next[idx] = text;
                                  await updateAdItems(
                                    selectedAdGroup.id,
                                    ad.id,
                                    'headlines',
                                    next,
                                  );
                                },
                              });
                            }}
                          />

                          <Separator className="my-4" />

                          <EditableItemList
                            title="Descriptions"
                            icon={<Type className="h-3.5 w-3.5 text-muted-foreground" />}
                            itemLabel="description"
                            items={descriptionItems}
                            layout="lines"
                            maxLength={90}
                            maxItems={4}
                            showCount
                            placeholder="New description (max 90 chars)"
                            onAdd={async (text) => {
                              const next = [...currentDescriptions, text];
                              await updateAdItems(
                                selectedAdGroup.id,
                                ad.id,
                                'descriptions',
                                next,
                              );
                            }}
                            onEdit={async (item, newText) => {
                              const idx = parseInt(item.id.split('-').pop() ?? '0');
                              const next = [...currentDescriptions];
                              next[idx] = newText;
                              await updateAdItems(
                                selectedAdGroup.id,
                                ad.id,
                                'descriptions',
                                next,
                              );
                            }}
                            onDelete={async (item) => {
                              const idx = parseInt(item.id.split('-').pop() ?? '0');
                              const next = currentDescriptions.filter(
                                (_, i) => i !== idx,
                              );
                              await updateAdItems(
                                selectedAdGroup.id,
                                ad.id,
                                'descriptions',
                                next,
                              );
                            }}
                            onAiSuggest={() =>
                              setAiDialog({
                                type: 'description',
                                mode: 'add',
                                context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}\nExisting headlines: ${currentHeadlines.join(' | ') || '(none)'}`,
                                existing: currentDescriptions,
                                onAccept: async (text) => {
                                  const next = [
                                    ...(ad.descriptions ?? []).map(
                                      (d) => d.text,
                                    ),
                                    text,
                                  ];
                                  await updateAdItems(
                                    selectedAdGroup.id,
                                    ad.id,
                                    'descriptions',
                                    next,
                                  );
                                },
                              })
                            }
                            onAiRewriteItem={(item) => {
                              const idx = parseInt(
                                item.id.split('-').pop() ?? '0',
                              );
                              setAiDialog({
                                type: 'description',
                                mode: 'rewrite',
                                currentText: item.text,
                                context: `Campaign: ${campaign.name}\nAd group: ${selectedAdGroup.name}\nExisting headlines: ${currentHeadlines.join(' | ') || '(none)'}`,
                                existing: currentDescriptions,
                                onAccept: async (text) => {
                                  const next = [...currentDescriptions];
                                  next[idx] = text;
                                  await updateAdItems(
                                    selectedAdGroup.id,
                                    ad.id,
                                    'descriptions',
                                    next,
                                  );
                                },
                              });
                            }}
                          />
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    bare
                    icon={<FileText className="h-5 w-5" />}
                    title="No ads in this ad group"
                    description="Add ads via chat or Google Ads directly."
                  />
                )}
              </div>
            </div>
          ) : (
            <Card className="flex h-64 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Select an ad group to view its keywords and ads
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Activity timeline — what the system has done on this campaign */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Activity
          </h2>
          <span className="text-xs text-muted-foreground">
            · recent agent decisions and actions
          </span>
        </div>
        <ActivityTimeline
          entries={activity}
          emptyTitle="No activity yet on this campaign"
          emptyDescription="Agent actions, auto-optimizations, and user edits will appear here with full history."
        />
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${
          deleteTarget?.type === 'campaign'
            ? 'campaign'
            : deleteTarget?.type === 'ad_group'
              ? 'ad group'
              : 'ad'
        }?`}
        description={
          deleteTarget?.type === 'campaign'
            ? `Permanently delete "${deleteTarget?.name}" and ALL its ad groups, ads, and keywords? This cannot be undone.`
            : deleteTarget?.type === 'ad_group'
              ? `Permanently delete ad group "${deleteTarget?.name}" and all its ads and keywords?`
              : `Permanently delete ad "${deleteTarget?.name}"?`
        }
        confirmLabel="Delete permanently"
        destructive
        onConfirm={handleDelete}
      />

      {/* Ayn content generation dialog — shared across keywords, negative
          keywords, headlines, and descriptions. The active config is
          stored in aiDialog state and set by whichever EditableItemList
          fired the onAiSuggest callback. */}
      {aiDialog && (
        <AiSuggestDialog
          open={!!aiDialog}
          onOpenChange={(open) => !open && setAiDialog(null)}
          contentType={aiDialog.type}
          mode={aiDialog.mode}
          currentText={aiDialog.currentText}
          context={aiDialog.context}
          existingItems={aiDialog.existing}
          onAccept={aiDialog.onAccept}
        />
      )}
    </div>
  );
}
