'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/patterns/PageHeader';
import { api } from '@/lib/api-client';

function NewReportPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [brandName, setBrandName] = useState('');
  const [domain, setDomain] = useState('');
  const [keywords, setKeywords] = useState('');
  const [includeLlm, setIncludeLlm] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const paramBrand = searchParams.get('brand');
    const paramDomain = searchParams.get('domain');
    const paramKeywords = searchParams.get('keywords');

    if (paramBrand) setBrandName(paramBrand);
    if (paramDomain) setDomain(paramDomain);
    if (paramKeywords) setKeywords(paramKeywords);

    if (!paramBrand) {
      api
        .get<{ company_profile?: { company_name?: string; domain?: string; services?: Array<{ name: string }> } }>(
          '/api/settings',
        )
        .then((s) => {
          if (s.company_profile) {
            const p = s.company_profile;
            if (p.company_name && !paramBrand) setBrandName(p.company_name);
            if (p.domain && !paramDomain) setDomain(p.domain);
            if (p.services?.length && !paramKeywords) {
              setKeywords(p.services.map((svc) => svc.name).join(', '));
            }
          }
        })
        .catch(() => {
          /* silent */
        });
    }
  }, [searchParams]);

  async function runReport() {
    if (!brandName || !domain || !keywords.trim()) return;
    setRunning(true);
    setProgress('Starting visibility report…');
    try {
      const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      setProgress(
        `Checking ${keywordList.length} keywords across Google, AI Overviews${includeLlm ? ', ChatGPT' : ''}, and paid search…`,
      );
      const data = await api.post<{ report_id?: string; error?: string }>(
        '/api/visibility/run',
        {
          brand_name: brandName,
          domain,
          target_keywords: keywordList,
          include_llm_check: includeLlm,
        },
      );
      if (data.report_id) {
        toast.success('Report ready');
        router.push(`/visibility/${data.report_id}`);
      } else {
        setProgress(data.error || 'Report completed. Check the Visibility dashboard.');
        setRunning(false);
      }
    } catch (e) {
      setProgress(`Error: ${(e as Error).message}`);
      setRunning(false);
    }
  }

  const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
  const keywordCount = keywordList.length;
  const effectiveCount = Math.min(keywordCount, 10);
  const estCost = (
    effectiveCount * 0.004 + (includeLlm ? Math.min(keywordCount, 8) * 0.01 : 0)
  ).toFixed(2);

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
        title="New visibility report"
        description="Check your brand presence across Google, AI Overviews, ChatGPT, and paid search."
      />

      <div className="max-w-2xl">
        <Card className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Brand name</Label>
              <Input
                id="brand-name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="ACI InfoTech"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-domain">Domain</Label>
              <Input
                id="brand-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="aciinfotech.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-keywords">Target keywords</Label>
            <Textarea
              id="target-keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="dynamics 365 consulting, d365 implementation, ERP migration, Microsoft partner"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {keywordCount} keyword{keywordCount === 1 ? '' : 's'}
              {keywordCount > 10 ? ' (top 10 will be checked)' : ''} · Est. cost: ${estCost}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeLlm}
              onChange={(e) => setIncludeLlm(e.target.checked)}
              className="rounded border-border"
            />
            Check LLM visibility (ChatGPT) — adds ~${(keywordCount * 0.01).toFixed(2)}
          </label>

          <Button
            onClick={runReport}
            disabled={running || !brandName || !domain || keywordCount === 0}
            className="w-full"
            size="lg"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {running ? 'Running…' : 'Generate report'}
          </Button>

          {progress && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">{progress}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function NewReportPage() {
  return (
    <Suspense fallback={null}>
      <NewReportPageInner />
    </Suspense>
  );
}
