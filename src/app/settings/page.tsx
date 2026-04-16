'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Brain,
  Building2,
  CheckCircle,
  Clock,
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  ScrollText,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/patterns/PageHeader';
import { api } from '@/lib/api-client';

interface Service {
  name: string;
  landing_page: string;
  description: string;
}
interface Competitor {
  name: string;
  domain: string;
}
interface CompanyProfile {
  company_name: string;
  domain: string;
  tagline: string;
  services: Service[];
  differentiators: string[];
  target_industries: string[];
  known_competitors: Competitor[];
  brand_terms: string[];
  default_negative_keywords: string[];
  tone: string;
}

const emptyProfile: CompanyProfile = {
  company_name: '',
  domain: '',
  tagline: '',
  services: [],
  differentiators: [],
  target_industries: [],
  known_competitors: [],
  brand_terms: [],
  default_negative_keywords: [],
  tone: '',
};

function SectionCard({
  icon,
  title,
  description,
  children,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<CompanyProfile>(emptyProfile);
  const [profileDirty, setProfileDirty] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get<Record<string, unknown>>('/api/settings');
      setSettings(data);
      if (data.company_profile && typeof data.company_profile === 'object') {
        setProfile({
          ...emptyProfile,
          ...(data.company_profile as Partial<CompanyProfile>),
        });
      }
    } catch {
      toast.error('Could not load settings');
    }
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      const data = await api.get<{ connected: boolean }>(
        '/api/google-ads/auth/status',
      );
      setConnected(data.connected);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    checkConnection();
  }, [fetchSettings, checkConnection]);

  async function handleSave() {
    setSaving(true);
    try {
      const toSave: Record<string, unknown> = {};
      if (profileDirty) toSave.company_profile = profile;
      for (const key of dirtyKeys) {
        toSave[key] = settings[key];
      }
      if (Object.keys(toSave).length === 0) {
        toast.info('Nothing to save');
        return;
      }
      await api.patch('/api/settings', toSave);
      toast.success('Settings saved');
      setDirtyKeys(new Set());
      setProfileDirty(false);
    } catch {
      /* api-client toast */
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  }

  function updateProfile<K extends keyof CompanyProfile>(
    key: K,
    value: CompanyProfile[K],
  ) {
    setProfile((p) => ({ ...p, [key]: value }));
    setProfileDirty(true);
  }

  const hasDirty = dirtyKeys.size > 0 || profileDirty;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<SettingsIcon className="h-5 w-5" />}
        title="Settings"
        description="Connections, brand voice, automation guardrails, and agent configuration."
        actions={
          <Button onClick={handleSave} disabled={saving || !hasDirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasDirty ? (
              <CheckCircle className="h-4 w-4" />
            ) : null}
            {saving ? 'Saving…' : hasDirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />

      <div className="max-w-4xl space-y-6">
        {/* Google Ads Connection */}
        <SectionCard
          icon={<Link2 className="h-4 w-4" />}
          title="Google Ads connection"
          description="OAuth link to the account your campaigns will push to."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/connection">
                {connected ? 'Manage' : 'Connect'}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          }
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-success' : 'bg-critical'}`}
            />
            <Badge variant={connected ? 'success' : 'critical'}>
              {connected ? 'Connected' : 'Not connected'}
            </Badge>
          </div>
        </SectionCard>

        {/* Google Analytics 4 */}
        <SectionCard
          icon={<BarChart3 className="h-4 w-4" />}
          title="Google Analytics 4"
          description="Property ID links your site analytics to the briefing and cross-insights."
        >
          <div className="space-y-1.5">
            <Label htmlFor="ga4">GA4 Property ID</Label>
            <Input
              id="ga4"
              value={(settings.ga4_property_id as string) || ''}
              onChange={(e) => updateSetting('ga4_property_id', e.target.value)}
              placeholder="123456789"
              className="max-w-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Find this in GA4: Admin → Property Settings → Property ID. Just the number, no &ldquo;properties/&rdquo; prefix.
            </p>
          </div>
        </SectionCard>

        {/* Company profile */}
        <SectionCard
          icon={<Building2 className="h-4 w-4" />}
          title="Company profile"
          description="Powers ad copy, keyword research, and competitor targeting."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">Company name</Label>
              <Input
                id="company-name"
                value={profile.company_name}
                onChange={(e) => updateProfile('company_name', e.target.value)}
                placeholder="ACI InfoTech"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-domain">Domain</Label>
              <Input
                id="company-domain"
                value={profile.domain}
                onChange={(e) => updateProfile('domain', e.target.value)}
                placeholder="aciinfotech.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-tagline">Tagline</Label>
              <Input
                id="company-tagline"
                value={profile.tagline}
                onChange={(e) => updateProfile('tagline', e.target.value)}
                placeholder="Microsoft partner — D365, Azure"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="services">Services / Products</Label>
            <Input
              id="services"
              value={profile.services.map((s) => s.name).join(', ')}
              onChange={(e) =>
                updateProfile(
                  'services',
                  e.target.value
                    .split(',')
                    .map((s) => ({
                      name: s.trim(),
                      landing_page: '',
                      description: '',
                    }))
                    .filter((s) => s.name),
                )
              }
              placeholder="Dynamics 365, Azure Cloud, Power Platform, AI Solutions"
            />
            <p className="text-[10px] text-muted-foreground">
              Comma-separated. Used as seed keywords for research. Landing pages are provided per-campaign in chat.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Differentiators / USPs</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateProfile('differentiators', [...profile.differentiators, ''])
                }
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {profile.differentiators.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No differentiators yet. Add one so the AI can use it in ad copy.
                </p>
              )}
              {profile.differentiators.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={d}
                    onChange={(e) => {
                      const arr = [...profile.differentiators];
                      arr[i] = e.target.value;
                      updateProfile('differentiators', arr);
                    }}
                    placeholder="e.g. 15+ years Microsoft Gold Partner"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      updateProfile(
                        'differentiators',
                        profile.differentiators.filter((_, j) => j !== i),
                      )
                    }
                    className="text-muted-foreground hover:text-critical"
                    aria-label="Remove differentiator"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="industries">Target industries</Label>
              <Input
                id="industries"
                value={profile.target_industries.join(', ')}
                onChange={(e) =>
                  updateProfile(
                    'target_industries',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="Manufacturing, Healthcare, Retail"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-terms">Brand terms to defend</Label>
              <Input
                id="brand-terms"
                value={profile.brand_terms.join(', ')}
                onChange={(e) =>
                  updateProfile(
                    'brand_terms',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="ACI InfoTech, ArqAI"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Known competitors (for conquest targeting)</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateProfile('known_competitors', [
                    ...profile.known_competitors,
                    { name: '', domain: '' },
                  ])
                }
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {profile.known_competitors.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No competitors set. Add some so the AI can track their moves.
                </p>
              )}
              {profile.known_competitors.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={c.name}
                    onChange={(e) => {
                      const arr = [...profile.known_competitors];
                      arr[i] = { ...arr[i], name: e.target.value };
                      updateProfile('known_competitors', arr);
                    }}
                    placeholder="Competitor name"
                    className="w-48"
                  />
                  <Input
                    value={c.domain}
                    onChange={(e) => {
                      const arr = [...profile.known_competitors];
                      arr[i] = { ...arr[i], domain: e.target.value };
                      updateProfile('known_competitors', arr);
                    }}
                    placeholder="domain.com"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      updateProfile(
                        'known_competitors',
                        profile.known_competitors.filter((_, j) => j !== i),
                      )
                    }
                    className="text-muted-foreground hover:text-critical"
                    aria-label="Remove competitor"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default-negatives">Default negative keywords</Label>
            <Input
              id="default-negatives"
              value={profile.default_negative_keywords.join(', ')}
              onChange={(e) =>
                updateProfile(
                  'default_negative_keywords',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="jobs, careers, free, tutorial, training, certification"
            />
            <p className="text-[10px] text-muted-foreground">
              Auto-applied to every new ad group.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tone">Brand voice / tone</Label>
            <Input
              id="tone"
              value={profile.tone}
              onChange={(e) => updateProfile('tone', e.target.value)}
              placeholder="Professional, enterprise-focused, outcome-driven"
            />
          </div>
        </SectionCard>

        {/* AI Configuration */}
        <SectionCard
          icon={<Brain className="h-4 w-4" />}
          title="AI configuration"
          description="Models are selected per task — Sonnet for strategy, Haiku for quick tasks, GPT-4o as fallback."
        >
          <dl className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Research & build
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                Claude Sonnet 4
              </dd>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Quick tasks
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                Claude Haiku 3.5
              </dd>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Fallback
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">
                GPT-4o / mini
              </dd>
            </div>
          </dl>
        </SectionCard>

        {/* Budget safety */}
        <SectionCard
          icon={<Clock className="h-4 w-4" />}
          title="Budget safety (QA sentinel)"
          description="Hard limits Ayn will never cross — review and adjust before enabling automatic actions."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="warn-threshold">Warning threshold ($/day)</Label>
              <Input
                id="warn-threshold"
                type="number"
                value={
                  typeof settings.qa_warn_budget_daily_micros === 'number'
                    ? settings.qa_warn_budget_daily_micros / 1_000_000
                    : 500
                }
                onChange={(e) =>
                  updateSetting(
                    'qa_warn_budget_daily_micros',
                    parseFloat(e.target.value) * 1_000_000,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-threshold">Hard block ($/day)</Label>
              <Input
                id="block-threshold"
                type="number"
                value={
                  typeof settings.qa_block_budget_daily_micros === 'number'
                    ? settings.qa_block_budget_daily_micros / 1_000_000
                    : 2000
                }
                onChange={(e) =>
                  updateSetting(
                    'qa_block_budget_daily_micros',
                    parseFloat(e.target.value) * 1_000_000,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-bid">Max keyword bid ($)</Label>
              <Input
                id="max-bid"
                type="number"
                value={
                  typeof settings.qa_max_keyword_bid_micros === 'number'
                    ? settings.qa_max_keyword_bid_micros / 1_000_000
                    : 50
                }
                onChange={(e) =>
                  updateSetting(
                    'qa_max_keyword_bid_micros',
                    parseFloat(e.target.value) * 1_000_000,
                  )
                }
              />
            </div>
          </div>
        </SectionCard>

        {/* Automation */}
        <SectionCard
          icon={<Clock className="h-4 w-4" />}
          title="Automation"
          description="When Ayn runs, and which of her recommendations apply automatically vs wait for your review."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sync-interval">Performance sync interval</Label>
              <Select
                value={String(settings.sync_interval_hours ?? 6)}
                onValueChange={(v) =>
                  updateSetting('sync_interval_hours', parseInt(v))
                }
              >
                <SelectTrigger id="sync-interval">
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">Every 6 hours</SelectItem>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Once daily</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                How often Google Ads performance data pulls down.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auto-apply-mode">Auto-apply</Label>
              <Select
                value={
                  // Derive single UI value from the two underlying settings
                  (() => {
                    const enabled = settings.auto_optimize_enabled === true;
                    const tier = settings.auto_apply_risk_tier;
                    if (!enabled) return 'off';
                    if (tier === 'auto-and-review') return 'auto-and-review';
                    return 'auto-only';
                  })()
                }
                onValueChange={(v) => {
                  // Write both underlying settings atomically.
                  if (v === 'off') {
                    updateSetting('auto_optimize_enabled', false);
                    updateSetting('auto_apply_risk_tier', 'never');
                  } else if (v === 'auto-only') {
                    updateSetting('auto_optimize_enabled', true);
                    updateSetting('auto_apply_risk_tier', 'auto');
                  } else if (v === 'auto-and-review') {
                    updateSetting('auto_optimize_enabled', true);
                    updateSetting('auto_apply_risk_tier', 'auto-and-review');
                  }
                }}
              >
                <SelectTrigger id="auto-apply-mode">
                  <SelectValue placeholder="Select auto-apply mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off — queue everything for review</SelectItem>
                  <SelectItem value="auto-only">
                    Apply safe changes (auto-tier only)
                  </SelectItem>
                  <SelectItem value="auto-and-review">
                    Apply everything (auto + review tier)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Auto-tier changes are bid adjustments ≤±15%, negative-keyword
                adds, and pauses on keywords with zero historical conversions.
                Review-tier includes budget changes and pauses on converting
                keywords. Blocked-tier (budget &gt;±50%, bid &gt;±25%) never
                auto-applies regardless of this setting.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Agent logs link */}
        <SectionCard
          icon={<ScrollText className="h-4 w-4" />}
          title="Agent logs"
          description="AI agent execution history, token usage, and errors."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/logs">
                View logs
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground">
            Every tool call, model used, token count, and duration is recorded for auditing.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
