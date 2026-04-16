'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  Shield,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { PageHeader } from '@/components/patterns/PageHeader';
import { api, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface AccountInfo {
  customer_id: string;
  account_name: string;
}

function ConnectionPageInner() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const checkConnectionStatus = useCallback(async () => {
    try {
      const data = await api.get<{
        connected: boolean;
        account?: AccountInfo;
      }>('/api/google-ads/auth/status');
      if (data.connected) {
        setConnected(true);
        setAccountInfo(data.account ?? null);
      } else {
        setConnected(false);
        setAccountInfo(null);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    const success = searchParams.get('success');
    const err = searchParams.get('error');

    if (success === 'true') {
      setConnected(true);
      checkConnectionStatus();
      toast.success('Connected to Google Ads');
    }
    if (err) {
      setError(decodeURIComponent(err));
    }
  }, [searchParams, checkConnectionStatus]);

  useEffect(() => {
    checkConnectionStatus();
  }, [checkConnectionStatus]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ auth_url?: string; error?: string }>(
        '/api/google-ads/auth/connect',
        {},
      );
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }
      if (data.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to connect',
      );
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    try {
      await api.post('/api/google-ads/auth/disconnect', {});
      setConnected(false);
      setAccountInfo(null);
      toast.success('Disconnected from Google Ads');
    } catch {
      /* api-client toast */
    }
  }

  const steps = [
    {
      title: 'Set up environment variables',
      description:
        'Add your Google Ads API credentials to .env.local: Client ID, Client Secret, Developer Token, and Redirect URI.',
    },
    {
      title: 'Authorize with Google',
      description:
        'Start the OAuth2 flow. You will be redirected to Google to grant access to your account.',
    },
    {
      title: 'Select your account',
      description: 'Choose which Google Ads account (customer ID) to manage.',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={
          <Button variant="ghost" size="icon" asChild className="h-9 w-9">
            <Link href="/settings" aria-label="Back to settings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
        title="Connect Google Ads"
        description="OAuth2 link to the account your campaigns will push to."
      />

      <div className="max-w-2xl space-y-6">
        {error && (
          <Alert variant="critical">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Connection error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {connected && accountInfo ? (
          <Card className="border-success/30 bg-success/5 p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Connected
                </h2>
                <Badge variant="success" className="mt-0.5">
                  Active
                </Badge>
              </div>
            </div>
            <Separator className="my-4" />
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="font-medium text-foreground">
                  {accountInfo.account_name}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Customer ID</dt>
                <dd className="font-mono text-foreground">
                  {accountInfo.customer_id}
                </dd>
              </div>
            </dl>
            <Separator className="my-4" />
            <Button
              variant="outline"
              onClick={() => setDisconnectOpen(true)}
              className="text-critical hover:text-critical"
            >
              Disconnect
            </Button>
          </Card>
        ) : (
          <>
            {/* Setup steps */}
            <Card className="p-6">
              <h2 className="mb-4 text-base font-semibold text-foreground">
                Setup steps
              </h2>
              <ol className="space-y-4">
                {steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                        i === 0
                          ? 'bg-info/15 text-info'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <p
                        className={cn(
                          'text-sm font-medium',
                          i === 0 ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            {/* Connect button */}
            <Card className="p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
                <Shield className="h-5 w-5" />
              </div>
              <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
                Your credentials are stored securely and only used to manage
                your Google Ads account.
              </p>
              <Button
                onClick={handleConnect}
                disabled={loading}
                size="lg"
                className="mx-auto"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {loading ? 'Connecting…' : 'Connect Google Ads account'}
              </Button>
            </Card>
          </>
        )}
      </div>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect Google Ads?"
        description="All campaigns will stop syncing. You can reconnect later — your stored campaign data is preserved."
        confirmLabel="Disconnect"
        destructive
        onConfirm={handleDisconnect}
      />
    </div>
  );
}

export default function ConnectionPage() {
  return (
    <Suspense fallback={null}>
      <ConnectionPageInner />
    </Suspense>
  );
}
