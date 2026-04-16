'use client';

/**
 * SetupBanner has been replaced by <OnboardingChecklist /> in the shell.
 * This file now only exports <FeatureNotReady /> which is still used by
 * per-feature pages (e.g. analytics) when a specific integration is missing.
 */

import Link from 'next/link';
import { AlertCircle, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Shown in place of a page body when a specific feature isn't configured.
 */
export function FeatureNotReady({
  feature,
  message,
}: {
  feature: string;
  message: string;
}) {
  const settingsLink = feature === 'googleAds' ? '/settings/connection' : '/settings';
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-warning/10 text-warning">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">Setup required</h3>
      <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button asChild>
        <Link href={settingsLink}>
          Go to settings
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
    </Card>
  );
}
