'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CheckSquare,
  Eye,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Radar,
  Settings,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AciLogo } from '@/components/brand/AciLogo';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useSidebar } from './SidebarContext';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  showBadge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/briefing', label: 'Briefing', icon: Zap, description: 'AI insights & alerts' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, description: 'Talk to your strategist' },
  { href: '/portfolio', label: 'Portfolio', icon: PieChart, description: 'Campaign health & spend' },
  { href: '/intelligence', label: 'Intelligence', icon: Radar, description: 'Competitor war room' },
  { href: '/visibility', label: 'Visibility', icon: Eye, description: 'Brand & analytics intel' },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, description: 'Review AI actions', showBadge: true },
  { href: '/settings', label: 'Settings', icon: Settings, description: 'Configuration' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggleSidebar } = useSidebar();
  const [pendingCount, setPendingCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);

  // Effective state: collapsed but hovered = show expanded
  const showExpanded = !collapsed || hovered;

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [apps, conn] = await Promise.allSettled([
          api.get<unknown[]>('/api/approvals?status=pending&limit=50'),
          api.get<{ connected: boolean }>('/api/google-ads/auth/status'),
        ]);
        if (apps.status === 'fulfilled') {
          setPendingCount(Array.isArray(apps.value) ? apps.value.length : 0);
        }
        if (conn.status === 'fulfilled') {
          setConnected(conn.value.connected || false);
        }
      } catch {
        /* silent — sidebar badges are non-critical */
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000);
    return () => clearInterval(interval);
  }, []);

  function handleMouseEnter() {
    if (!collapsed) return;
    hoverTimeout.current = setTimeout(() => setHovered(true), 200);
  }

  function handleMouseLeave() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setHovered(false);
  }

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'fixed left-0 top-0 z-40 flex h-full flex-col border-r border-border bg-card transition-all duration-200 ease-in-out',
        showExpanded ? 'w-64' : 'w-16',
      )}
      aria-label="Primary navigation"
    >
      {/* Brand header — ACI Interactive is the primary brand */}
      <div className="flex h-16 items-center border-b border-border px-4">
        <Link
          href="/briefing"
          className="flex min-w-0 items-center gap-2.5 overflow-hidden"
          aria-label="ACI Interactive home"
        >
          <AciLogo variant="mark" width={32} className="shrink-0" />
          {showExpanded && (
            <div className="min-w-0 whitespace-nowrap leading-tight">
              <span className="block text-sm font-semibold tracking-tight text-foreground">
                ACI Interactive
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Marketing command center
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/settings' && pathname.startsWith(item.href + '/'));
          const Icon = item.icon;
          const showPendingDot =
            !showExpanded && item.showBadge && pendingCount > 0;

          const linkBody = (
            <Link
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group/nav relative flex items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-accent/5 hover:text-foreground',
              )}
            >
              {/* Active marker bar */}
              {isActive && (
                <span
                  className="absolute -left-2 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover/nav:text-foreground',
                )}
              />
              {showExpanded && (
                <>
                  <span className="whitespace-nowrap">{item.label}</span>
                  {item.showBadge && pendingCount > 0 && (
                    <Badge variant="warning" className="ml-auto">
                      {pendingCount}
                    </Badge>
                  )}
                </>
              )}
              {showPendingDot && (
                <span
                  className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning ring-2 ring-card"
                  aria-label={`${pendingCount} pending`}
                />
              )}
            </Link>
          );

          // Only wrap in Tooltip when collapsed — otherwise the label is visible.
          return !showExpanded ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{linkBody}</TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-2">
                <span>{item.label}</span>
                {item.showBadge && pendingCount > 0 && (
                  <span className="text-[10px] text-warning">
                    {pendingCount} pending
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.href}>{linkBody}</div>
          );
        })}
      </nav>

      <Separator />

      {/* Toggle + Connection status */}
      <div>
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/5 hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          )}
          {showExpanded && <span className="whitespace-nowrap">Collapse sidebar</span>}
        </button>

        <div
          className={cn(
            'flex items-center gap-2 px-3 py-3',
            !showExpanded && 'justify-center',
          )}
          title={connected ? 'Google Ads connected' : 'Google Ads not connected'}
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              connected ? 'bg-success' : 'bg-critical',
            )}
            aria-hidden="true"
          />
          {showExpanded && (
            <span className="whitespace-nowrap text-[10px] text-muted-foreground">
              {connected ? 'Google Ads connected' : 'Google Ads disconnected'}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
