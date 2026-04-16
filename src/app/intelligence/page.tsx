'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Eye,
  Globe,
  Loader2,
  MessageSquare,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Tag,
  Trash2,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { EmptyState } from '@/components/patterns/EmptyState';
import { MetricCard } from '@/components/patterns/MetricCard';
import { PageHeader } from '@/components/patterns/PageHeader';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface Competitor {
  id: string;
  domain: string;
  company_name: string | null;
  observed_keywords: Array<{ text: string; first_seen?: string; last_seen?: string }>;
  observed_ads: Array<{ description?: string; headline?: string; first_seen?: string }>;
  auction_insights: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type ThreatLevel = 'Critical' | 'High' | 'Medium' | 'Low';

function getThreatLevel(competitor: Competitor): ThreatLevel {
  const kwCount = competitor.observed_keywords?.length || 0;
  const adCount = competitor.observed_ads?.length || 0;
  const hasNotes = !!competitor.notes;
  const score = kwCount * 2 + adCount * 3 + (hasNotes ? 5 : 0);
  if (score >= 20) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

const THREAT_VARIANT: Record<ThreatLevel, 'critical' | 'warning' | 'info' | 'muted'> = {
  Critical: 'critical',
  High: 'warning',
  Medium: 'info',
  Low: 'muted',
};

const THREAT_STRIPE: Record<ThreatLevel, string> = {
  Critical: 'bg-critical',
  High: 'bg-warning',
  Medium: 'bg-info',
  Low: 'bg-muted',
};

// ============================================================
// Competitor card
// ============================================================

function CompetitorCard({
  competitor,
  onDelete,
  onAnalyze,
}: {
  competitor: Competitor;
  onDelete: (id: string) => void;
  onAnalyze: (domain: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const threat = getThreatLevel(competitor);
  // Fallback: parse keywords from notes field if observed_keywords is empty
  let keywords = competitor.observed_keywords || [];
  if (keywords.length === 0 && competitor.notes) {
    const match = competitor.notes.match(/Ranks for:\s*(.+)/);
    if (match) {
      keywords = match[1]
        .split(',')
        .map((k) => ({ text: k.trim(), first_seen: competitor.created_at }))
        .filter((k) => k.text);
    }
  }
  const ads = competitor.observed_ads || [];

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        <div
          className={cn('w-1 shrink-0', THREAT_STRIPE[threat])}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 p-5">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                <Globe className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {competitor.company_name || competitor.domain}
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {competitor.domain}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={THREAT_VARIANT[threat]}>{threat}</Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(competitor.id)}
                aria-label={`Remove ${competitor.domain}`}
                className="h-7 w-7 text-muted-foreground hover:text-critical"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Keywords
              </p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">
                {keywords.length}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Ad themes
              </p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">
                {ads.length}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Updated
              </p>
              <TimeAgo
                value={competitor.updated_at}
                className="mt-0.5 block text-xs font-medium text-foreground"
              />
            </div>
          </div>

          {/* Strategic notes */}
          {competitor.notes && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-accent/30 bg-accent/5 p-3">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {competitor.notes}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onAnalyze(competitor.domain)}
              className="flex-1"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Deep analysis
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              <Eye className="h-3.5 w-3.5" />
              {expanded ? 'Hide' : 'Details'}
            </Button>
          </div>

          {/* Expanded details */}
          {expanded && (
            <>
              <Separator className="my-4" />
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Tag className="h-3 w-3" /> Observed keywords
                  </h4>
                  {keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((kw, i) => (
                        <Badge
                          key={i}
                          variant="muted"
                          className="normal-case"
                        >
                          {typeof kw === 'string' ? kw : kw.text}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No keywords observed yet. Run a deep analysis to discover them.
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Search className="h-3 w-3" /> Ad copy themes
                  </h4>
                  {ads.length > 0 ? (
                    <div className="space-y-1.5">
                      {ads.map((ad, i) => (
                        <div
                          key={i}
                          className="rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground"
                        >
                          {typeof ad === 'string'
                            ? ad
                            : ad.headline || ad.description || JSON.stringify(ad)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No ad themes observed yet.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// Main Intelligence page
// ============================================================

export default function IntelligencePage() {
  const router = useRouter();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-competitor dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newName, setNewName] = useState('');
  const [addPending, setAddPending] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Competitor | null>(null);

  const fetchCompetitors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Competitor[]>('/api/competitors');
      setCompetitors(Array.isArray(data) ? data : []);
    } catch {
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  async function handleAdd() {
    if (!newDomain.trim()) return;
    setAddPending(true);
    try {
      await api.post('/api/competitors', {
        domain: newDomain.trim(),
        company_name: newName.trim() || undefined,
      });
      toast.success(`Tracking ${newDomain.trim()}`);
      setAddOpen(false);
      setNewDomain('');
      setNewName('');
      fetchCompetitors();
    } catch {
      /* api-client toast */
    } finally {
      setAddPending(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/competitors?id=${deleteTarget.id}`);
      toast.success(`Removed ${deleteTarget.domain}`);
      fetchCompetitors();
    } catch {
      /* api-client toast */
    } finally {
      setDeleteTarget(null);
    }
  }

  function analyzeInChat(domain: string) {
    const prompt = `Run a deep competitive analysis on ${domain} — what keywords are they targeting, what's their ad strategy, what are their strengths and weaknesses, and where can we outmaneuver them?`;
    router.push(`/chat?prefill=${encodeURIComponent(prompt)}`);
  }

  const criticalThreats = competitors.filter(
    (c) => getThreatLevel(c) === 'Critical',
  );
  const highThreats = competitors.filter((c) => getThreatLevel(c) === 'High');
  const otherCompetitors = competitors.filter((c) => {
    const t = getThreatLevel(c);
    return t !== 'Critical' && t !== 'High';
  });
  const totalKeywords = competitors.reduce(
    (s, c) => s + (c.observed_keywords?.length || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Radar className="h-5 w-5" />}
        title="Intelligence"
        description="Competitor war room — tracking, analysis, and counter-strategies."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCompetitors}
              disabled={loading}
              aria-label="Refresh competitors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Track competitor
            </Button>
          </>
        }
      />

      {/* Overview stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Tracked"
          value={competitors.length}
          icon={<Globe className="h-4 w-4" />}
          accent="accent"
        />
        <MetricCard
          label="Critical threats"
          value={criticalThreats.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="critical"
        />
        <MetricCard
          label="High threats"
          value={highThreats.length}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="warning"
        />
        <MetricCard
          label="Keywords observed"
          value={totalKeywords.toLocaleString()}
          icon={<Tag className="h-4 w-4" />}
          accent="primary"
        />
      </div>

      {/* AI scan CTA */}
      <Card className="relative overflow-hidden border-accent/30">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/10 via-primary/5 to-transparent" />
        <div className="relative flex items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Run an AI competitor scan
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ask the AI to discover competitors from your keywords and analyze their strategies.
              </p>
            </div>
          </div>
          <Button size="sm" asChild>
            <Link href="/chat">
              <MessageSquare className="h-4 w-4" />
              Scan in chat
            </Link>
          </Button>
        </div>
      </Card>

      {/* Competitor groups */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-6 w-6" />}
          title="No competitors tracked yet"
          description="Add competitors manually or ask the AI to discover them from your keywords and market."
          action={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add manually
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/chat">
                  <MessageSquare className="h-4 w-4" />
                  Discover via AI
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {criticalThreats.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-critical">
                <AlertTriangle className="h-3.5 w-3.5" /> Critical threats
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {criticalThreats.map((c) => (
                  <CompetitorCard
                    key={c.id}
                    competitor={c}
                    onDelete={(id) =>
                      setDeleteTarget(
                        competitors.find((x) => x.id === id) ?? null,
                      )
                    }
                    onAnalyze={analyzeInChat}
                  />
                ))}
              </div>
            </section>
          )}

          {highThreats.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-warning">
                High threats
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {highThreats.map((c) => (
                  <CompetitorCard
                    key={c.id}
                    competitor={c}
                    onDelete={(id) =>
                      setDeleteTarget(
                        competitors.find((x) => x.id === id) ?? null,
                      )
                    }
                    onAnalyze={analyzeInChat}
                  />
                ))}
              </div>
            </section>
          )}

          {otherCompetitors.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Monitoring
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {otherCompetitors.map((c) => (
                  <CompetitorCard
                    key={c.id}
                    competitor={c}
                    onDelete={(id) =>
                      setDeleteTarget(
                        competitors.find((x) => x.id === id) ?? null,
                      )
                    }
                    onAnalyze={analyzeInChat}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Add competitor dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Track a competitor</DialogTitle>
            <DialogDescription>
              Add a domain to begin monitoring. You can ask the AI to run a deep
              analysis after adding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="competitor-domain">Domain</Label>
              <Input
                id="competitor-domain"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. accenture.com"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="competitor-name">Company name (optional)</Label>
              <Input
                id="competitor-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Accenture"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addPending}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!newDomain.trim() || addPending}>
              {addPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add competitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Remove ${deleteTarget?.domain}?`}
        description="This competitor and all observed data will be removed from tracking. You can re-add it later."
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
