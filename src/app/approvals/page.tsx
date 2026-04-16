'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckSquare,
  LayoutGrid,
  List,
  Loader2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { DataTable } from '@/components/patterns/DataTable';
import { EmptyState } from '@/components/patterns/EmptyState';
import { PageHeader } from '@/components/patterns/PageHeader';
import { SkeletonFeed } from '@/components/patterns/SkeletonFeed';
import { StatusBadge, type LifecycleStatus } from '@/components/patterns/StatusBadge';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface ApprovalItem {
  id: string;
  action_type: string;
  entity_type: string;
  status: string;
  ai_reasoning: string | null;
  confidence_score: number | null;
  priority: string;
  agent_name: string | null;
  created_at: string;
  optimization_source: string | null;
}

// Maps an optimization_source to a compact display label + badge variant.
// `null` means "not an OptimizerAgent recommendation" (e.g. chat-generated
// campaign build, manual approval).
const SOURCE_LABELS: Record<
  string,
  { label: string; variant: 'info' | 'warning' | 'success' | 'accent' | 'muted' }
> = {
  'bid-efficiency': { label: 'Bid efficiency', variant: 'info' },
  'landing-page-roi': { label: 'Landing page ROI', variant: 'accent' },
  'budget-pacing': { label: 'Budget pacing', variant: 'warning' },
  'quality-score-decay': { label: 'Quality score', variant: 'warning' },
  'search-terms-harvest': { label: 'Search terms', variant: 'info' },
  'competitor-auction': { label: 'Competitor auction', variant: 'accent' },
  dayparting: { label: 'Dayparting', variant: 'info' },
  'attribution-rebalance': { label: 'Attribution', variant: 'accent' },
};

const TABS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'applied', label: 'Applied' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
];

const PRIORITY_VARIANT: Record<string, 'critical' | 'warning' | 'info' | 'muted'> = {
  urgent: 'critical',
  high: 'warning',
  normal: 'info',
  low: 'muted',
};

function prettyAction(a: string): string {
  return a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type ViewMode = 'cards' | 'table';

export default function ApprovalsPage() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('cards');

  // Restore last view mode
  useEffect(() => {
    const saved = localStorage.getItem('approvals-view') as ViewMode | null;
    if (saved === 'cards' || saved === 'table') setView(saved);
  }, []);

  function setViewPersistent(next: ViewMode) {
    setView(next);
    localStorage.setItem('approvals-view', next);
  }

  const tableColumns = useMemo<ColumnDef<ApprovalItem>[]>(
    () => [
      {
        accessorKey: 'action_type',
        header: 'Action',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground">
            {prettyAction(row.original.action_type)}
          </span>
        ),
      },
      {
        accessorKey: 'entity_type',
        header: 'Entity',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.entity_type}
          </span>
        ),
      },
      {
        accessorKey: 'optimization_source',
        header: 'Source',
        enableSorting: true,
        cell: ({ row }) => {
          const src = row.original.optimization_source;
          if (!src) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const cfg = SOURCE_LABELS[src];
          return cfg ? (
            <Badge variant={cfg.variant} className="text-[10px]">
              {cfg.label}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">{src}</span>
          );
        },
      },
      {
        accessorKey: 'agent_name',
        header: 'Agent',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {row.original.agent_name ? (
              <>
                <Bot className="h-3 w-3" />
                {row.original.agent_name}
              </>
            ) : (
              <>
                <User className="h-3 w-3" />
                Manual
              </>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant={PRIORITY_VARIANT[row.original.priority] ?? 'muted'}>
            {row.original.priority}
          </Badge>
        ),
      },
      {
        accessorKey: 'confidence_score',
        header: 'Confidence',
        enableSorting: true,
        cell: ({ row }) => {
          const c = row.original.confidence_score;
          if (c === null) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="w-20">
              <div className="mb-0.5 text-[10px] font-mono font-semibold text-foreground">
                {Math.round(c * 100)}%
              </div>
              <Progress value={c * 100} />
            </div>
          );
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        enableSorting: true,
        cell: ({ row }) => (
          <TimeAgo
            value={row.original.created_at}
            className="text-xs text-muted-foreground"
          />
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status as LifecycleStatus}
            hideIcon
          />
        ),
      },
      {
        id: 'open',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/approvals/${row.original.id}`);
            }}
            aria-label={`Open ${row.original.action_type}`}
          >
            Open
            <ArrowRight className="h-3 w-3" />
          </Button>
        ),
      },
    ],
    [router],
  );

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ApprovalItem[]>(`/api/approvals?status=${filter}`);
      setApprovals(Array.isArray(data) ? data : []);
    } catch {
      setApprovals([]);
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  async function handleBulkApprove() {
    const pendingIds = approvals.filter((a) => a.status === 'pending').map((a) => a.id);
    if (pendingIds.length === 0) return;
    setBulkLoading(true);
    try {
      await api.post('/api/approvals/bulk', { ids: pendingIds, action: 'approve' });
      toast.success(`Approved ${pendingIds.length} items`);
      fetchApprovals();
    } catch {
      /* api-client toast */
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<CheckSquare className="h-5 w-5" />}
        title="Approval queue"
        description="Review and apply AI-proposed changes before they push to Google Ads."
        actions={
          filter === 'pending' && approvals.length > 0 ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => setBulkDialogOpen(true)}
              disabled={bulkLoading}
            >
              {bulkLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Approve all ({approvals.length})
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          <Button
            variant={view === 'cards' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewPersistent('cards')}
            className="h-7 px-2"
            aria-label="Card view"
            aria-pressed={view === 'cards'}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </Button>
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewPersistent('table')}
            className="h-7 px-2"
            aria-label="Table view"
            aria-pressed={view === 'table'}
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Table</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <SkeletonFeed count={4} />
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-6 w-6" />}
          title={`No ${filter} approvals`}
          description="When AI agents propose changes, they appear here for your review."
        />
      ) : view === 'table' ? (
        <DataTable
          columns={tableColumns}
          data={approvals}
          searchKey="action_type"
          searchPlaceholder="Search actions…"
          enableExport
          exportFilename={`approvals-${filter}.csv`}
          pageSize={25}
        />
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => {
            const priorityVariant = PRIORITY_VARIANT[a.priority] ?? 'muted';
            const confidence = a.confidence_score ?? null;
            return (
              <Link key={a.id} href={`/approvals/${a.id}`} className="block">
                <Card className="group cursor-pointer p-5 transition-colors hover:border-border/80">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {prettyAction(a.action_type)}
                        </h3>
                        {a.optimization_source &&
                          SOURCE_LABELS[a.optimization_source] && (
                            <Badge
                              variant={
                                SOURCE_LABELS[a.optimization_source].variant
                              }
                              className="text-[10px]"
                            >
                              {SOURCE_LABELS[a.optimization_source].label}
                            </Badge>
                          )}
                        <Badge variant={priorityVariant}>
                          {a.priority}
                        </Badge>
                        <StatusBadge
                          status={a.status as LifecycleStatus}
                          hideIcon
                          className="text-[10px]"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {a.entity_type}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          {a.agent_name ? (
                            <>
                              <Bot className="h-3 w-3" />
                              {a.agent_name}
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3" />
                              Manual
                            </>
                          )}
                        </span>
                        <span>·</span>
                        <TimeAgo value={a.created_at} />
                      </div>
                      {a.ai_reasoning && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {a.ai_reasoning}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      {confidence !== null && (
                        <div className="w-24">
                          <div className="mb-1 flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">Confidence</span>
                            <span className="font-mono font-semibold text-foreground">
                              {Math.round(confidence * 100)}%
                            </span>
                          </div>
                          <Progress value={confidence * 100} />
                        </div>
                      )}
                      <ArrowRight
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          'group-hover:translate-x-0.5 group-hover:text-foreground',
                        )}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        title={`Approve all ${approvals.length} pending items?`}
        description={
          <span className="flex items-start gap-2 text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This will push every pending change to Google Ads immediately.
              Make sure you&apos;ve reviewed them.
            </span>
          </span>
        }
        confirmLabel={bulkLoading ? 'Approving…' : 'Approve all'}
        onConfirm={handleBulkApprove}
      />
    </div>
  );
}
