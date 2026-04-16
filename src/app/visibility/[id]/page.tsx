'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadCsv, printToPdf } from '@/lib/export';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { EmptyState } from '@/components/patterns/EmptyState';
import { PageHeader } from '@/components/patterns/PageHeader';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface Report {
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
  organic_results: unknown[];
  ai_overview_results: unknown[];
  llm_results: unknown[];
  paid_results: unknown[];
  competitor_comparison: Record<
    string,
    { organic: number; ai_citations: number; paid: number }
  >;
  api_cost_cents: number;
  created_at: string;
}

function scoreTone(score: number) {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'critical';
}

function toneTextClass(
  tone: 'success' | 'warning' | 'critical',
): string {
  return tone === 'success'
    ? 'text-success'
    : tone === 'warning'
      ? 'text-warning'
      : 'text-critical';
}

function toneBgClass(
  tone: 'success' | 'warning' | 'critical',
): string {
  return tone === 'success'
    ? 'bg-success/10 text-success'
    : tone === 'warning'
      ? 'bg-warning/10 text-warning'
      : 'bg-critical/10 text-critical';
}

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchReport = useCallback(async () => {
    try {
      const data = await api.get<Report & { error?: string }>(
        `/api/visibility/${id}`,
      );
      setReport(data.error ? null : data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  async function handleDelete() {
    if (!report) return;
    try {
      await api.delete(`/api/visibility/${report.id}`);
      toast.success('Report deleted');
      router.push('/visibility');
    } catch {
      /* api-client toast */
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <EmptyState
        icon={<Eye className="h-6 w-6" />}
        title="Report not found"
        description="This visibility report doesn't exist or may have been removed."
        action={
          <Button variant="outline" asChild>
            <Link href="/visibility">
              <ArrowLeft className="h-4 w-4" />
              Back to visibility
            </Link>
          </Button>
        }
      />
    );
  }

  const overallTone = scoreTone(report.overall_score);

  const scoreBar = (label: string, score: number) => {
    const tone = scoreTone(score);
    return (
      <div className="flex items-center gap-3">
        <span className="w-28 text-xs text-muted-foreground">{label}</span>
        <div className="flex-1">
          <Progress value={score} />
        </div>
        <span className={cn('w-10 text-right text-sm font-bold', toneTextClass(tone))}>
          {score}
        </span>
      </div>
    );
  };

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
        title={report.brand_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{report.domain}</span>
            <span>·</span>
            <TimeAgo value={report.created_at} />
            <span>·</span>
            <span>${(report.api_cost_cents / 100).toFixed(2)} cost</span>
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const params = new URLSearchParams({
                  brand: report.brand_name,
                  domain: report.domain,
                  keywords: report.target_keywords.join(', '),
                });
                router.push(`/visibility/new?${params.toString()}`);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Re-run
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    downloadCsv(
                      `visibility-${report.domain}-${new Date(report.created_at).toISOString().slice(0, 10)}.csv`,
                      [
                        { header: 'Metric', value: (r: { metric: string; value: string | number }) => r.metric },
                        { header: 'Value', value: (r) => r.value },
                      ],
                      [
                        { metric: 'Brand', value: report.brand_name },
                        { metric: 'Domain', value: report.domain },
                        { metric: 'Generated', value: new Date(report.created_at).toISOString() },
                        { metric: 'Overall score', value: report.overall_score },
                        { metric: 'Organic score', value: report.organic_score },
                        { metric: 'AI overviews score', value: report.ai_overview_score },
                        { metric: 'LLM score', value: report.llm_score },
                        { metric: 'Paid score', value: report.paid_score },
                        { metric: 'Keywords analyzed', value: report.target_keywords.length },
                      ],
                    );
                    toast.success('Exported to CSV');
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Download CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    printToPdf();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Print / save as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-critical hover:text-critical"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      {/* Overall score */}
      <Card className="p-6">
        <div className="flex items-center gap-6">
          <div
            className={cn(
              'flex h-20 w-20 shrink-0 items-center justify-center rounded-md text-3xl font-bold',
              toneBgClass(overallTone),
            )}
          >
            {report.overall_score}
          </div>
          <div className="flex-1 space-y-2">
            {scoreBar('Organic', report.organic_score)}
            {scoreBar('AI Overviews', report.ai_overview_score)}
            {scoreBar('LLM', report.llm_score)}
            {scoreBar('Paid search', report.paid_score)}
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {report.target_keywords.length} keywords analyzed
        </p>
      </Card>

      {/* Competitor comparison */}
      {Object.keys(report.competitor_comparison || {}).length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Competitor comparison
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead className="text-center">Organic hits</TableHead>
                <TableHead className="text-center">AI citations</TableHead>
                <TableHead className="text-center">Paid ads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(report.competitor_comparison)
                .sort(
                  ([, a], [, b]) =>
                    b.organic + b.ai_citations + b.paid - (a.organic + a.ai_citations + a.paid),
                )
                .slice(0, 10)
                .map(([domain, data]) => (
                  <TableRow key={domain}>
                    <TableCell className="text-foreground">{domain}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {data.organic}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {data.ai_citations}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {data.paid}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Recommendations */}
      {report.recommendations?.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Action plan
            </h2>
            <Badge variant="accent">{report.recommendations.length}</Badge>
          </div>
          <div className="space-y-2">
            {report.recommendations.map((rec, i) => (
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
                  <p className="text-sm font-medium text-foreground">{rec.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{rec.action}</p>
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
        </Card>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this report?"
        description="The visibility report and all its data will be permanently removed."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
