'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  CircleX,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

import { AynMark } from '@/components/brand/Ayn';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TimeAgo } from '@/components/patterns/TimeAgo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useChatPanel } from './ChatPanelContext';
import { useSidebar } from './SidebarContext';

interface AccountInfo {
  connected: boolean;
  account?: {
    customer_id?: string | null;
    account_name?: string | null;
  };
}

export function TopBar() {
  const { collapsed } = useSidebar();
  const { openChat } = useChatPanel();
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  // Load connection/account info for the user menu
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<AccountInfo>('/api/google-ads/auth/status');
        setAccount(res);
      } catch {
        setAccount({ connected: false });
      }
    };
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/api/performance/sync', {});
      setLastSyncedAt(new Date().toISOString());
      toast.success('Performance data synced');
    } catch {
      // api-client already surfaced the error toast
    } finally {
      setSyncing(false);
    }
  }

  async function handleSignOut() {
    try {
      await api.post('/api/google-ads/auth/disconnect', {});
      toast.success('Signed out of Google Ads');
      setAccount({ connected: false });
      // Reload the page to refresh any account-dependent state
      window.location.href = '/settings/connection';
    } catch {
      /* api-client toast */
    }
  }

  const accountName =
    account?.account?.account_name ||
    (account?.connected ? 'Google Ads account' : 'Not connected');
  const customerId = account?.account?.customer_id ?? null;
  const initials = accountName
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md transition-all duration-200 ease-in-out',
        collapsed ? 'left-16' : 'left-64',
      )}
    >
      <div id="page-header" className="flex items-center gap-3" />

      <div className="flex items-center gap-2">
        {/* Freshness indicator */}
        {lastSyncedAt && (
          <div className="mr-1 hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span>
              Synced <TimeAgo value={lastSyncedAt} />
            </span>
          </div>
        )}

        {/* Sync button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          aria-label="Sync Google Ads performance data"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {syncing ? 'Syncing…' : 'Sync'}
        </Button>

        {/* Command palette hint (actual shortcut is wired in CommandPalette.tsx) */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Dispatch a synthetic Cmd+K keydown so the palette opens from click too
            document.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
            );
          }}
          aria-label="Open command palette"
          className="hidden md:inline-flex"
        >
          <span className="text-muted-foreground">Command</span>
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>

        {/* Chat with Ayn */}
        <Button size="sm" onClick={() => openChat()}>
          <AynMark size={16} aria-label="" />
          Chat with Ayn
        </Button>

        {/* User / account menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-1 rounded-full outline-none ring-offset-background transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Account menu"
            >
              <Avatar className="h-9 w-9 ring-1 ring-border">
                <AvatarFallback>{initials || <User className="h-4 w-4" />}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px]">
                    {initials || <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {accountName}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {account?.connected ? (
                      <Badge variant="success">
                        <CircleCheck className="h-3 w-3" />
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="muted">
                        <CircleX className="h-3 w-3" />
                        Not connected
                      </Badge>
                    )}
                    {customerId && (
                      <span className="text-[10px] text-muted-foreground">
                        {customerId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <SettingsIcon className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/connection">
                <ExternalLink className="h-4 w-4" />
                {account?.connected ? 'Manage connection' : 'Connect Google Ads'}
              </Link>
            </DropdownMenuItem>
            {account?.connected && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-critical focus:text-critical"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out of Google Ads
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
