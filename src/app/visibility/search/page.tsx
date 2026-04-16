'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  DollarSign,
  Globe,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  brand_name: string;
  domain: string;
  overall_score: number;
  organic_score: number;
  ai_overview_score: number;
  llm_score: number;
  paid_score: number;
  target_keywords: string[];
  organic_results: Array<{
    keyword: string;
    brand_position: number | null;
    top_competitor: string | null;
  }>;
  ai_overview_results: Array<{
    keyword: string;
    has_overview: boolean;
    brand_cited: boolean;
    citations: string[];
  }>;
  llm_results: Array<{
    keyword: string;
    question: string;
    mentioned: boolean;
    position: number | null;
    competitors_mentioned: string[];
  }>;
  paid_results: Array<{
    keyword: string;
    brand_ad: number | null;
    competitor_ads: string[];
  }>;
  created_at: string;
}

function scoreVariant(score: number): 'success' | 'warning' | 'critical' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'critical';
}

function ScoreBadge({ score }: { score: number }) {
  return <Badge variant={scoreVariant(score)}>{score}/100</Badge>;
}

export default function SearchVisibilityPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Report[]>('/api/visibility')
      .then((d) => {
        setReports(Array.isArray(d) ? d : []);
        if (Array.isArray(d) && d.length > 0) setSelected(d[0]);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => setLoading(false));
  }, []);

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
        title="Search visibility"
        description="Organic rankings, AI Overviews, LLM mentions, paid ads."
        actions={
          <Button size="sm" asChild>
            <Link href="/visibility/new">
              <Search className="h-4 w-4" />
              New report
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !selected ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="No visibility reports yet"
          description="Run your first report to see how your brand appears across search."
          action={
            <Button asChild>
              <Link href="/visibility/new">Run first report</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {/* Report selector */}
          {reports.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {reports.slice(0, 10).map((r) => (
                <Button
                  key={r.id}
                  variant={selected.id === r.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelected(r)}
                  className="shrink-0"
                >
                  {new Date(r.created_at).toLocaleDateString()} ({r.overall_score}/100)
                </Button>
              ))}
            </div>
          )}

          {/* Scores overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <ScoreTile
              icon={<Globe className="h-5 w-5" />}
              label="Organic"
              score={selected.organic_score}
              tone="info"
            />
            <ScoreTile
              icon={<Sparkles className="h-5 w-5" />}
              label="AI Overviews"
              score={selected.ai_overview_score}
              tone="accent"
            />
            <ScoreTile
              icon={<Bot className="h-5 w-5" />}
              label="LLM"
              score={selected.llm_score}
              tone="success"
            />
            <ScoreTile
              icon={<DollarSign className="h-5 w-5" />}
              label="Paid"
              score={selected.paid_score}
              tone="warning"
            />
          </div>

          {/* Organic Results */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Organic rankings
              </h2>
              <ScoreBadge score={selected.organic_score} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Your position</TableHead>
                  <TableHead>Top competitor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.organic_results?.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-foreground">{r.keyword}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'font-mono font-semibold',
                          r.brand_position
                            ? r.brand_position <= 3
                              ? 'text-success'
                              : r.brand_position <= 10
                                ? 'text-warning'
                                : 'text-critical'
                            : 'text-critical',
                        )}
                      >
                        {r.brand_position ? `#${r.brand_position}` : 'Not found'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.top_competitor || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* AI Overview Results */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                AI overview citations
              </h2>
              <ScoreBadge score={selected.ai_overview_score} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>AI overview?</TableHead>
                  <TableHead>You cited?</TableHead>
                  <TableHead>Who&apos;s cited</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.ai_overview_results?.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-foreground">{r.keyword}</TableCell>
                    <TableCell>
                      {r.has_overview ? (
                        <Badge variant="info">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.brand_cited ? (
                        <Badge variant="success">Yes</Badge>
                      ) : r.has_overview ? (
                        <Badge variant="critical">No</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.citations?.slice(0, 3).join(', ') || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* LLM Results */}
          {selected.llm_results?.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  LLM visibility (ChatGPT)
                </h2>
                <ScoreBadge score={selected.llm_score} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question asked</TableHead>
                    <TableHead>Mentioned?</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Competitors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.llm_results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-foreground">
                        {r.question}
                      </TableCell>
                      <TableCell>
                        {r.mentioned ? (
                          <Badge variant="success">Yes</Badge>
                        ) : (
                          <Badge variant="critical">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.position ? `#${r.position}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.competitors_mentioned?.slice(0, 3).join(', ') || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Paid Results */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Paid search presence
              </h2>
              <ScoreBadge score={selected.paid_score} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Your ad</TableHead>
                  <TableHead>Competitor ads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.paid_results?.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-foreground">{r.keyword}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'font-mono font-semibold',
                          r.brand_ad ? 'text-success' : 'text-critical',
                        )}
                      >
                        {r.brand_ad ? `#${r.brand_ad}` : 'Not bidding'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.competitor_ads?.join(', ') || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScoreTile({
  icon,
  label,
  score,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  score: number;
  tone: 'info' | 'accent' | 'success' | 'warning';
}) {
  const toneClass = {
    info: 'bg-info/10 text-info',
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  } as const;
  return (
    <Card className="p-4 text-center">
      <div
        className={cn(
          'mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-md',
          toneClass[tone],
        )}
      >
        {icon}
      </div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{score}</p>
    </Card>
  );
}
