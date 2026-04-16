'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Minus, TrendingDown, TrendingUp } from 'lucide-react';

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
import { EmptyState } from '@/components/patterns/EmptyState';
import { PageHeader } from '@/components/patterns/PageHeader';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface Report {
  id: string;
  overall_score: number;
  organic_score: number;
  ai_overview_score: number;
  llm_score: number;
  paid_score: number;
  target_keywords: string[];
  created_at: string;
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff > 0) {
    return (
      <Badge variant="success">
        <TrendingUp className="h-3 w-3" />+{diff}
      </Badge>
    );
  }
  if (diff < 0) {
    return (
      <Badge variant="critical">
        <TrendingDown className="h-3 w-3" />
        {diff}
      </Badge>
    );
  }
  return (
    <Badge variant="muted">
      <Minus className="h-3 w-3" />0
    </Badge>
  );
}

function scoreTone(score: number) {
  if (score >= 70) return 'text-success';
  if (score >= 40) return 'text-warning';
  return 'text-critical';
}

export default function TrendsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Report[]>('/api/visibility')
      .then((d) => setReports(Array.isArray(d) ? d : []))
      .catch(() => {
        /* silent */
      })
      .finally(() => setLoading(false));
  }, []);

  const chronological = [...reports].reverse();

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
        title="Visibility trends"
        description="Track how your scores change over time."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length < 2 ? (
        <EmptyState
          icon={<TrendingUp className="h-6 w-6" />}
          title="Need more data"
          description="Run at least 2 visibility reports to see trends. Weekly or monthly cadence works best."
          action={
            <Button asChild>
              <Link href="/visibility/new">Run report</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Score timeline */}
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Overall score timeline
            </h2>
            <div className="space-y-2">
              {chronological.map((report, i) => {
                const prev = i > 0 ? chronological[i - 1] : null;
                return (
                  <Link
                    key={report.id}
                    href={`/visibility/${report.id}`}
                    className="flex items-center gap-4 rounded-md border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {new Date(report.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex-1">
                      <Progress value={report.overall_score} />
                    </div>
                    <span className={cn('w-8 text-sm font-bold', scoreTone(report.overall_score))}>
                      {report.overall_score}
                    </span>
                    {prev && (
                      <TrendArrow
                        current={report.overall_score}
                        previous={prev.overall_score}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </Card>

          {/* Score breakdown */}
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Score breakdown
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Overall</TableHead>
                  <TableHead className="text-center">Organic</TableHead>
                  <TableHead className="text-center">AI Overview</TableHead>
                  <TableHead className="text-center">LLM</TableHead>
                  <TableHead className="text-center">Paid</TableHead>
                  <TableHead className="text-center">Keywords</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chronological.map((report, i) => {
                  const prev = i > 0 ? chronological[i - 1] : null;
                  const scoreCell = (current: number, previous?: number) => (
                    <TableCell className="text-center">
                      <span className={cn('font-bold', scoreTone(current))}>
                        {current}
                      </span>
                      {previous !== undefined && current !== previous && (
                        <span
                          className={cn(
                            'ml-1 text-[10px]',
                            current > previous ? 'text-success' : 'text-critical',
                          )}
                        >
                          {current > previous ? '+' : ''}
                          {current - previous}
                        </span>
                      )}
                    </TableCell>
                  );
                  return (
                    <TableRow key={report.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString()}
                      </TableCell>
                      {scoreCell(report.overall_score, prev?.overall_score)}
                      {scoreCell(report.organic_score, prev?.organic_score)}
                      {scoreCell(report.ai_overview_score, prev?.ai_overview_score)}
                      {scoreCell(report.llm_score, prev?.llm_score)}
                      {scoreCell(report.paid_score, prev?.paid_score)}
                      <TableCell className="text-center text-muted-foreground">
                        {report.target_keywords.length}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* First vs latest */}
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Progress: first report vs latest
            </h2>
            <div className="grid grid-cols-5 gap-4">
              {(
                [
                  'overall_score',
                  'organic_score',
                  'ai_overview_score',
                  'llm_score',
                  'paid_score',
                ] as const
              ).map((key) => {
                const labels: Record<string, string> = {
                  overall_score: 'Overall',
                  organic_score: 'Organic',
                  ai_overview_score: 'AI Overview',
                  llm_score: 'LLM',
                  paid_score: 'Paid',
                };
                const first = chronological[0][key];
                const latest = chronological[chronological.length - 1][key];
                const diff = latest - first;
                return (
                  <div
                    key={key}
                    className="rounded-md border border-border bg-muted/20 p-3 text-center"
                  >
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {labels[key]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {first} →{' '}
                      <span className="text-sm font-bold text-foreground">
                        {latest}
                      </span>
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-sm font-bold',
                        diff > 0
                          ? 'text-success'
                          : diff < 0
                            ? 'text-critical'
                            : 'text-muted-foreground',
                      )}
                    >
                      {diff > 0 ? `+${diff}` : diff < 0 ? diff : '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
