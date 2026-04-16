'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Global route-segment error boundary.
 * Wraps every page under src/app/ in a React error boundary.
 * Next 16 uses `unstable_retry` (added in v16.2.0) instead of the older `reset` prop.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // In production this should forward to an error tracking service.
    // For now, log to the browser console so issues don't get silently eaten.
    console.error('[route-error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            We hit an unexpected error loading this page. The issue has been logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error.message && (
            <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
              {error.message}
              {error.digest && (
                <div className="mt-1 text-[10px] opacity-60">ref: {error.digest}</div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={() => unstable_retry()} className="flex-1">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/briefing">
                <Home className="h-4 w-4" />
                Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
