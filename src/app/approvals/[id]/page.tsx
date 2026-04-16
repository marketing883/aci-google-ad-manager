'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  ActivityTimeline,
  type ActivityEntry,
} from '@/components/patterns/ActivityTimeline';
import { EmptyState } from '@/components/patterns/EmptyState';
import { PageHeader } from '@/components/patterns/PageHeader';
import {
  StatusBadge,
  type LifecycleStatus,
} from '@/components/patterns/StatusBadge';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface PredictedImpact {
  revenue_delta_micros?: number;
  conversion_delta?: number;
  cost_delta_micros?: number;
  cpa_delta_micros?: number;
  roas_delta?: number;
  confidence?: number;
  timeframe?: 'daily' | 'weekly' | 'monthly';
  explanation?: string;
}

interface ApprovalDetail {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  previous_state: Record<string, unknown> | null;
  status: string;
  ai_reasoning: string | null;
  confidence_score: number | null;
  priority: string;
  agent_name: string | null;
  reviewer_notes: string | null;
  error_message: string | null;
  predicted_impact: PredictedImpact | null;
  actual_impact:
    | (PredictedImpact & {
        measurement_window_days?: number;
        baseline_source?: string;
        accuracy?: number;
      })
    | null;
  outcome_measured_at: string | null;
  optimization_source: string | null;
  created_at: string;
  reviewed_at: string | null;
  applied_at: string | null;
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

function fromMicros(v: number): number {
  return v / 1_000_000;
}

function prettyAction(a: string): string {
  return a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function PredictedImpactCard({ impact }: { impact: PredictedImpact }) {
  const timeframe = impact.timeframe ?? 'monthly';

  // Collect the rows the agent actually populated — don't show placeholders.
  const rows: Array<{
    label: string;
    value: string;
    tone: 'success' | 'critical' | 'muted';
  }> = [];

  if (typeof impact.revenue_delta_micros === 'number') {
    const v = fromMicros(impact.revenue_delta_micros);
    rows.push({
      label: 'Revenue',
      value: `${currency.format(v)} / ${timeframe}`,
      tone: v >= 0 ? 'success' : 'critical',
    });
  }
  if (typeof impact.conversion_delta === 'number') {
    const v = impact.conversion_delta;
    rows.push({
      label: 'Conversions',
      value: `${v >= 0 ? '+' : ''}${v} / ${timeframe}`,
      tone: v >= 0 ? 'success' : 'critical',
    });
  }
  if (typeof impact.cost_delta_micros === 'number') {
    const v = fromMicros(impact.cost_delta_micros);
    rows.push({
      label: 'Spend',
      value: `${currency.format(v)} / ${timeframe}`,
      // Rising spend isn't automatically bad — mark it muted so the reviewer
      // can weigh it against revenue.
      tone: 'muted',
    });
  }
  if (typeof impact.cpa_delta_micros === 'number') {
    const v = fromMicros(impact.cpa_delta_micros);
    rows.push({
      label: 'CPA',
      value: currency.format(v),
      // Lower CPA is better, so invert the sign for tone.
      tone: v <= 0 ? 'success' : 'critical',
    });
  }
  if (typeof impact.roas_delta === 'number') {
    const v = impact.roas_delta;
    rows.push({
      label: 'ROAS',
      value: `${v >= 0 ? '+' : ''}${v.toFixed(2)}x`,
      tone: v >= 0 ? 'success' : 'critical',
    });
  }

  if (rows.length === 0) return null;

  const toneClass = (tone: 'success' | 'critical' | 'muted') =>
    tone === 'success'
      ? 'text-success'
      : tone === 'critical'
        ? 'text-critical'
        : 'text-muted-foreground';

  return (
    <Card className="relative overflow-hidden border-accent/30 p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-transparent" />
      <div className="relative">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Predicted impact
          </h2>
          {typeof impact.confidence === 'number' && (
            <Badge variant="accent">
              {Math.round(impact.confidence * 100)}% confidence
            </Badge>
          )}
        </div>
        <dl className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between border-b border-border/40 py-1.5 text-sm last:border-0"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className={cn('font-mono font-semibold', toneClass(row.tone))}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {impact.explanation && (
          <>
            <Separator className="my-3" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {impact.explanation}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

// Measured outcome shown once the measure-outcomes cron has written
// actual_impact (typically 14 days post-apply). Renders the measured
// deltas side-by-side with the prediction (when available) so the
// reviewer sees how close Ayn came. Accuracy percentage is highlighted
// since it's the signal that tells the agent to trust its own predictions
// more (high accuracy) or recalibrate thresholds (low accuracy).
function ActualImpactCard({
  actual,
  predicted,
  measuredAt,
}: {
  actual: ApprovalDetail['actual_impact'];
  predicted: PredictedImpact | null;
  measuredAt: string | null;
}) {
  if (!actual) return null;

  const rows: Array<{
    label: string;
    actualValue: string;
    predictedValue: string | null;
    tone: 'success' | 'critical' | 'muted';
  }> = [];

  const fmtDelta = (
    value: number,
    kind: 'currency' | 'count' | 'roas',
    timeframe: string,
  ): string => {
    if (kind === 'currency') {
      return `${currency.format(fromMicros(value))} / ${timeframe}`;
    }
    if (kind === 'roas') {
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}x`;
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} / ${timeframe}`;
  };

  const timeframe = actual.timeframe ?? 'monthly';

  if (typeof actual.revenue_delta_micros === 'number') {
    const v = actual.revenue_delta_micros;
    rows.push({
      label: 'Revenue',
      actualValue: fmtDelta(v, 'currency', timeframe),
      predictedValue:
        typeof predicted?.revenue_delta_micros === 'number'
          ? fmtDelta(predicted.revenue_delta_micros, 'currency', timeframe)
          : null,
      tone: v >= 0 ? 'success' : 'critical',
    });
  }
  if (typeof actual.conversion_delta === 'number') {
    const v = actual.conversion_delta;
    rows.push({
      label: 'Conversions',
      actualValue: fmtDelta(v, 'count', timeframe),
      predictedValue:
        typeof predicted?.conversion_delta === 'number'
          ? fmtDelta(predicted.conversion_delta, 'count', timeframe)
          : null,
      tone: v >= 0 ? 'success' : 'critical',
    });
  }
  if (typeof actual.cost_delta_micros === 'number') {
    const v = actual.cost_delta_micros;
    rows.push({
      label: 'Spend',
      actualValue: fmtDelta(v, 'currency', timeframe),
      predictedValue:
        typeof predicted?.cost_delta_micros === 'number'
          ? fmtDelta(predicted.cost_delta_micros, 'currency', timeframe)
          : null,
      tone: 'muted',
    });
  }
  if (typeof actual.cpa_delta_micros === 'number') {
    const v = actual.cpa_delta_micros;
    rows.push({
      label: 'CPA',
      actualValue: currency.format(fromMicros(v)),
      predictedValue:
        typeof predicted?.cpa_delta_micros === 'number'
          ? currency.format(fromMicros(predicted.cpa_delta_micros))
          : null,
      tone: v <= 0 ? 'success' : 'critical',
    });
  }
  if (typeof actual.roas_delta === 'number') {
    const v = actual.roas_delta;
    rows.push({
      label: 'ROAS',
      actualValue: fmtDelta(v, 'roas', timeframe),
      predictedValue:
        typeof predicted?.roas_delta === 'number'
          ? fmtDelta(predicted.roas_delta, 'roas', timeframe)
          : null,
      tone: v >= 0 ? 'success' : 'critical',
    });
  }

  if (rows.length === 0 && !actual.explanation) return null;

  const toneClass = (tone: 'success' | 'critical' | 'muted') =>
    tone === 'success'
      ? 'text-success'
      : tone === 'critical'
        ? 'text-critical'
        : 'text-muted-foreground';

  const accuracy = actual.accuracy;
  const accuracyTone =
    typeof accuracy === 'number'
      ? accuracy >= 0.7
        ? 'success'
        : accuracy >= 0.4
          ? 'muted'
          : 'critical'
      : 'muted';

  return (
    <Card className="relative overflow-hidden border-success/30 p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success/5 via-transparent to-transparent" />
      <div className="relative">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Measured outcome
          </h2>
          {typeof accuracy === 'number' && (
            <Badge
              variant={
                accuracyTone === 'success'
                  ? 'success'
                  : accuracyTone === 'critical'
                    ? 'critical'
                    : 'muted'
              }
            >
              {Math.round(accuracy * 100)}% of prediction
            </Badge>
          )}
        </div>
        {measuredAt && (
          <p className="mb-3 text-[10px] text-muted-foreground">
            Measured {new Date(measuredAt).toLocaleDateString()} ·{' '}
            {actual.measurement_window_days ?? 14}-day window
          </p>
        )}
        {rows.length > 0 && (
          <dl className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 border-b border-border/40 py-1.5 text-sm last:border-0"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="flex flex-col items-end">
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      toneClass(row.tone),
                    )}
                  >
                    {row.actualValue}
                  </span>
                  {row.predictedValue && (
                    <span className="text-[10px] text-muted-foreground">
                      predicted {row.predictedValue}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {actual.explanation && (
          <>
            <Separator className="my-3" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {actual.explanation}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ============================================================
// Rich campaign payload renderer (preserved from original)
// ============================================================

interface CampaignPayload {
  campaign_name?: string;
  campaign_type?: string;
  budget_micros?: number;
  budget?: number;
  budget_type?: string;
  bidding_strategy?: string;
  target_cpa_micros?: number;
  target_roas?: number;
  start_date?: string;
  end_date?: string;
  geo_targets?: Array<{ country?: string }>;
  language_targets?: string[];
  network_settings?: { search?: boolean; display?: boolean; partners?: boolean };
  ad_groups_count?: number;
  ads_count?: number;
  keywords_count?: number;
  ad_groups?: Array<{
    name: string;
    bid_micros?: number;
    keywords?: Array<{ text: string; match_type: string }>;
    ads?: Array<{
      headlines: Array<{ text: string } | string>;
      descriptions: Array<{ text: string } | string>;
      final_urls: string[];
    }>;
  }>;
}

function CampaignSettingsBlock({ p }: { p: CampaignPayload }) {
  const budget = ((p.budget_micros ?? p.budget ?? 0) / 1_000_000).toFixed(2);
  const networks = [
    p.network_settings?.search && 'Search',
    p.network_settings?.display && 'Display',
    p.network_settings?.partners && 'Partners',
  ]
    .filter(Boolean)
    .join(', ');

  const rows: Array<[string, React.ReactNode]> = [
    ['Name', <span className="font-medium text-foreground">{p.campaign_name}</span>],
    ['Type', p.campaign_type],
    ['Budget', `$${budget}/${p.budget_type ?? 'day'}`],
    ['Bidding', (p.bidding_strategy ?? '—').replace(/_/g, ' ')],
  ];
  if (typeof p.target_cpa_micros === 'number') {
    rows.push(['Target CPA', `$${(p.target_cpa_micros / 1_000_000).toFixed(2)}`]);
  }
  if (typeof p.target_roas === 'number') {
    rows.push(['Target ROAS', `${p.target_roas}x`]);
  }
  rows.push(
    ['Start date', p.start_date || 'Immediately'],
    ['End date', p.end_date || 'No end date'],
    [
      'Locations',
      Array.isArray(p.geo_targets)
        ? p.geo_targets.map((g) => g.country || JSON.stringify(g)).join(', ')
        : '—',
    ],
    [
      'Languages',
      Array.isArray(p.language_targets) ? p.language_targets.join(', ') : '—',
    ],
    ['Networks', networks || '—'],
    [
      'Totals',
      `${p.ad_groups_count ?? 0} ad groups · ${p.ads_count ?? 0} ads · ${p.keywords_count ?? 0} keywords`,
    ],
  );

  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Campaign settings
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-border/40 py-1 text-xs last:border-0"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right text-foreground">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AdGroupBlock({ ag }: { ag: NonNullable<CampaignPayload['ad_groups']>[number] }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{ag.name}</h3>
        {ag.bid_micros && (
          <Badge variant="muted">
            Bid ${(ag.bid_micros / 1_000_000).toFixed(2)}
          </Badge>
        )}
      </div>

      {ag.keywords && ag.keywords.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Keywords ({ag.keywords.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ag.keywords.map((kw, j) => {
              const variant =
                kw.match_type === 'EXACT'
                  ? 'info'
                  : kw.match_type === 'PHRASE'
                    ? 'accent'
                    : 'muted';
              const display =
                kw.match_type === 'EXACT'
                  ? `[${kw.text}]`
                  : kw.match_type === 'PHRASE'
                    ? `"${kw.text}"`
                    : kw.text;
              return (
                <Badge key={j} variant={variant} className="normal-case">
                  {display}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {ag.ads?.map((ad, k) => {
        const headlines = ad.headlines
          ?.slice(0, 3)
          .map((h) => (typeof h === 'string' ? h : h.text))
          .join(' | ');
        const descriptions = ad.descriptions
          ?.slice(0, 2)
          .map((d) => (typeof d === 'string' ? d : d.text))
          .join(' ');
        let host: string | null = null;
        try {
          if (ad.final_urls?.[0]) host = new URL(ad.final_urls[0]).hostname;
        } catch {
          host = ad.final_urls?.[0] ?? null;
        }
        return (
          <div
            key={k}
            className="mb-2 rounded-md border border-border bg-background/60 p-3"
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ad {k + 1}
            </p>
            <p className="text-sm font-medium leading-snug text-info">
              {headlines}
            </p>
            {host && <p className="mt-0.5 text-xs text-success">{host}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{descriptions}</p>
            {ad.headlines && ad.headlines.length > 3 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                + {ad.headlines.length - 3} more headlines
                {(ad.descriptions?.length ?? 0) > 2 &&
                  `, ${(ad.descriptions?.length ?? 0) - 2} more descriptions`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Main page
// ============================================================

export default function ApprovalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [item, setItem] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ApprovalDetail>(`/api/approvals/${id}`);
      setItem(data);
    } catch {
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  async function handleApprove() {
    setActionPending('approve');
    try {
      await api.post(`/api/approvals/${id}/approve`, {});
      toast.success('Approved and applied');
      router.push('/approvals');
    } catch {
      /* api-client toast */
    } finally {
      setActionPending(null);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return;
    setActionPending('reject');
    try {
      await api.post(`/api/approvals/${id}/reject`, {
        reviewer_notes: rejectReason,
      });
      toast.success('Rejected');
      router.push('/approvals');
    } catch {
      /* api-client toast */
    } finally {
      setActionPending(null);
    }
  }

  async function handleRetry() {
    setActionPending('retry');
    try {
      await api.post(`/api/approvals/${id}/retry`, {});
      toast.success('Retry queued');
      fetchDetail();
    } catch {
      /* api-client toast */
    } finally {
      setActionPending(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!item) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6" />}
        title="Approval not found"
        description="This approval item doesn't exist or may have been removed."
        action={
          <Button asChild variant="outline">
            <Link href="/approvals">
              <ArrowLeft className="h-4 w-4" />
              Back to queue
            </Link>
          </Button>
        }
      />
    );
  }

  const payload = item.payload as CampaignPayload;
  const isCampaignPush =
    item.action_type === 'push_to_google_ads' && !!payload;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={
          <Button variant="ghost" size="icon" asChild className="h-9 w-9">
            <Link href="/approvals" aria-label="Back to approval queue">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
        title={prettyAction(item.action_type)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground/80">
              {item.entity_type}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {item.agent_name ? (
                <>
                  <Bot className="h-3 w-3" />
                  {item.agent_name}
                </>
              ) : (
                <>
                  <User className="h-3 w-3" />
                  Manual
                </>
              )}
            </span>
            <span>·</span>
            <TimeAgo value={item.created_at} />
            {item.entity_id && item.entity_type === 'campaign' && (
              <>
                <span>·</span>
                <Link
                  href={`/portfolio/${item.entity_id}`}
                  className="text-info hover:underline"
                >
                  View campaign
                </Link>
              </>
            )}
          </span>
        }
        actions={
          <StatusBadge status={item.status as LifecycleStatus} />
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Proposed changes */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            Proposed changes
          </h2>

          {isCampaignPush ? (
            <div className="space-y-4">
              <CampaignSettingsBlock p={payload} />
              {Array.isArray(payload.ad_groups) &&
                payload.ad_groups.map((ag, i) => <AdGroupBlock key={i} ag={ag} />)}
            </div>
          ) : item.previous_state ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Before
                </h3>
                <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
                  {Object.entries(item.previous_state).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between border-b border-border/40 py-1 text-xs last:border-0"
                    >
                      <span className="text-muted-foreground">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="text-foreground">{formatValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  After
                </h3>
                <div className="space-y-1 rounded-md border border-success/30 bg-success/5 p-3">
                  {Object.entries(item.payload).map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between border-b border-border/40 py-1 text-xs last:border-0"
                    >
                      <span className="text-muted-foreground">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="text-success">{formatValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
              {Object.entries(item.payload).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between border-b border-border/40 py-1 text-xs last:border-0"
                >
                  <span className="text-muted-foreground">
                    {k.replace(/_/g, ' ')}
                  </span>
                  <span className="text-foreground">{formatValue(v)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Sidebar: reasoning + actions */}
        <div className="space-y-4">
          {/* Actual first when measured — facts before predictions */}
          {item.actual_impact && (
            <ActualImpactCard
              actual={item.actual_impact}
              predicted={item.predicted_impact}
              measuredAt={item.outcome_measured_at}
            />
          )}
          {item.predicted_impact && <PredictedImpactCard impact={item.predicted_impact} />}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              AI reasoning
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.ai_reasoning || 'No reasoning provided.'}
            </p>

            {item.confidence_score !== null && (
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Confidence</span>
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      item.confidence_score > 0.7
                        ? 'text-success'
                        : item.confidence_score > 0.4
                          ? 'text-warning'
                          : 'text-critical',
                    )}
                  >
                    {Math.round(item.confidence_score * 100)}%
                  </span>
                </div>
                <Progress value={item.confidence_score * 100} />
              </div>
            )}

            {item.error_message && (
              <div className="mt-4 rounded-md border border-critical/30 bg-critical/5 p-3 text-xs text-critical">
                {item.error_message}
              </div>
            )}
          </Card>

          {item.status === 'pending' && (
            <Card className="space-y-3 p-5">
              <Button
                onClick={handleApprove}
                disabled={!!actionPending}
                className="w-full bg-success text-success-foreground hover:bg-success/90"
              >
                {actionPending === 'approve' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve & apply
              </Button>
              <Button
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={!!actionPending}
                className="w-full text-critical hover:text-critical"
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
            </Card>
          )}

          {item.status === 'failed' && (
            <Card className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-critical">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm font-medium">Push failed</p>
              </div>
              {item.error_message && (
                <p className="rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                  {item.error_message}
                </p>
              )}
              <Button
                onClick={handleRetry}
                disabled={!!actionPending}
                className="w-full bg-warning text-warning-foreground hover:bg-warning/90"
              >
                {actionPending === 'retry' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Retry push to Google Ads
              </Button>
            </Card>
          )}

          {item.status === 'applied' && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-4 w-4" />
                <p className="text-sm font-medium">Applied to Google Ads</p>
              </div>
              {item.applied_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <TimeAgo value={item.applied_at} />
                </p>
              )}
              {item.reviewer_notes && (
                <>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground">
                    Notes: {item.reviewer_notes}
                  </p>
                </>
              )}
            </Card>
          )}

          {item.status === 'approved' && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-info">
                <Clock className="h-4 w-4" />
                <p className="text-sm font-medium">Approved — awaiting push</p>
              </div>
              {item.reviewer_notes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Notes: {item.reviewer_notes}
                </p>
              )}
            </Card>
          )}

          {item.status === 'rejected' && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-critical">
                <X className="h-4 w-4" />
                <p className="text-sm font-medium">Rejected</p>
              </div>
              {item.reviewer_notes && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Reason: {item.reviewer_notes}
                </p>
              )}
            </Card>
          )}

          {item.status === 'expired' && (
            <Card className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <p className="text-sm font-medium">Expired</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Activity timeline — lifecycle history of this approval */}
      {(() => {
        const entries: ActivityEntry[] = [];

        entries.push({
          id: `${item.id}-created`,
          kind: 'ai_decision',
          title: 'Proposed by agent',
          description: item.ai_reasoning ?? undefined,
          timestamp: item.created_at,
          actor: item.agent_name ?? 'System',
          status: 'pending',
        });

        if (item.reviewed_at) {
          const reviewed =
            item.status === 'rejected'
              ? {
                  kind: 'user_edit' as const,
                  title: 'Rejected by reviewer',
                  description: item.reviewer_notes ?? undefined,
                  status: 'rejected',
                }
              : {
                  kind: 'user_edit' as const,
                  title: 'Approved by reviewer',
                  description: item.reviewer_notes ?? undefined,
                  status: 'approved',
                };
          entries.push({
            id: `${item.id}-reviewed`,
            timestamp: item.reviewed_at,
            actor: 'Reviewer',
            ...reviewed,
          });
        }

        if (item.applied_at) {
          entries.push({
            id: `${item.id}-applied`,
            kind: 'action',
            title: 'Pushed to Google Ads',
            description: 'Change is now live on the ad platform.',
            timestamp: item.applied_at,
            actor: 'System',
            status: 'applied',
          });
        }

        if (item.status === 'failed' && item.error_message) {
          entries.push({
            id: `${item.id}-failed`,
            kind: 'error',
            title: 'Push to Google Ads failed',
            description: item.error_message,
            timestamp: item.reviewed_at ?? item.created_at,
            actor: 'System',
            status: 'failed',
          });
        }

        if (item.status === 'expired') {
          entries.push({
            id: `${item.id}-expired`,
            kind: 'system',
            title: 'Expired without review',
            description: 'Approval window elapsed before a reviewer acted.',
            timestamp: item.created_at,
            actor: 'System',
            status: 'expired',
          });
        }

        // Reverse so latest is at top
        entries.reverse();

        return (
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Activity
              </h2>
              <span className="text-xs text-muted-foreground">
                · lifecycle history
              </span>
            </div>
            <ActivityTimeline entries={entries} />
          </Card>
        );
      })()}

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this approval?</DialogTitle>
            <DialogDescription>
              Tell the agent why — this helps the system learn what kinds of
              recommendations you don&apos;t want in the future.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)…"
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={actionPending === 'reject'}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || actionPending === 'reject'}
            >
              {actionPending === 'reject' && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
