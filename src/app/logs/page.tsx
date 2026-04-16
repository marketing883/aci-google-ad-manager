'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  ScrollText,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/patterns/DataTable';
import { EmptyState } from '@/components/patterns/EmptyState';
import { PageHeader } from '@/components/patterns/PageHeader';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';

interface LogEntry {
  id: string;
  agent_name: string;
  action: string;
  model_used: string | null;
  tokens_used: { input: number; output: number } | null;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  output_summary: string | null;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
}

const AGENT_OPTIONS = [
  { value: 'all', label: 'All agents' },
  { value: 'OrchestratorAgent', label: 'Orchestrator' },
  { value: 'ResearchAgent', label: 'Research' },
  { value: 'CampaignBuilderAgent', label: 'Campaign Builder' },
  { value: 'CopywriterAgent', label: 'Copywriter' },
  { value: 'OptimizerAgent', label: 'Optimizer' },
  { value: 'BidManagerAgent', label: 'Bid Manager' },
];

function StatusPill({ status }: { status: string }) {
  if (status === 'success') {
    return (
      <Badge variant="success">
        <CheckCircle className="h-3 w-3" />
        success
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="critical">
        <AlertCircle className="h-3 w-3" />
        error
      </Badge>
    );
  }
  return (
    <Badge variant="warning">
      <Clock className="h-3 w-3" />
      {status}
    </Badge>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<LogEntry[]>(
        `/api/logs?agent=${filter}&limit=500`,
      );
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
      toast.error('Failed to load agent logs');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns = useMemo<ColumnDef<LogEntry>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Time',
        enableSorting: true,
        cell: ({ row }) => (
          <TimeAgo
            value={row.original.created_at}
            className="text-xs text-muted-foreground"
          />
        ),
      },
      {
        accessorKey: 'agent_name',
        header: 'Agent',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-foreground">
            {row.original.agent_name}
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.action}
          </span>
        ),
      },
      {
        id: 'entity',
        header: 'Target',
        cell: ({ row }) => {
          const { entity_type, entity_id, entity_name } = row.original;
          if (!entity_type && !entity_name) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const href =
            entity_type === 'campaign' && entity_id
              ? `/portfolio/${entity_id}`
              : null;
          const content = (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-foreground">
                {entity_name ?? entity_id ?? 'Unknown'}
              </span>
              {entity_type && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {entity_type}
                </span>
              )}
            </span>
          );
          return href ? (
            <Link href={href} className="hover:underline">
              {content}
            </Link>
          ) : (
            content
          );
        },
      },
      {
        accessorKey: 'model_used',
        header: 'Model',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.original.model_used || '—'}
          </span>
        ),
      },
      {
        id: 'tokens',
        header: 'Tokens (in/out)',
        cell: ({ row }) => {
          const t = row.original.tokens_used;
          return (
            <span className="font-mono text-xs text-muted-foreground">
              {t ? `${t.input.toLocaleString()} / ${t.output.toLocaleString()}` : '—'}
            </span>
          );
        },
      },
      {
        accessorKey: 'duration_ms',
        header: 'Duration',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.duration_ms
              ? `${row.original.duration_ms}ms`
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => <StatusPill status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ScrollText className="h-5 w-5" />}
        title="Agent logs"
        description="Every action taken by your AI agents — models used, tokens consumed, outcomes."
        actions={
          <>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
              aria-label="Refresh logs"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </>
        }
      />

      {!loading && logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="No agent activity yet"
          description="Logs appear here as soon as your AI agents run optimizations, build campaigns, or execute research tasks."
        />
      ) : (
        <DataTable
          columns={columns}
          data={logs}
          searchKey="agent_name"
          searchPlaceholder="Search agents…"
          enableExport
          exportFilename="agent-logs.csv"
          pageSize={25}
          emptyState="No logs match your filters."
        />
      )}
    </div>
  );
}
