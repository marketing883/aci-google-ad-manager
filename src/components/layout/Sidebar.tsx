'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap, MessageSquare, PieChart, Radar, Eye,
  CheckSquare, Settings, Activity, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useSidebar } from './SidebarContext';

const NAV_ITEMS = [
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
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchCounts() {
    try {
      const [appRes, connRes] = await Promise.all([
        fetch('/api/approvals?status=pending&limit=50').then((r) => r.json()),
        fetch('/api/google-ads/auth/status').then((r) => r.json()),
      ]);
      setPendingCount(Array.isArray(appRes) ? appRes.length : 0);
      setConnected(connRes.connected || false);
    } catch { /* ignore */ }
  }

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
      className={`fixed left-0 top-0 h-full bg-gray-950 border-r border-gray-800 flex flex-col z-40 transition-all duration-200 ease-in-out ${
        showExpanded ? 'w-64' : 'w-16'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-800">
        <Link href="/briefing" className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-white" />
          </div>
          {showExpanded && (
            <div className="whitespace-nowrap">
              <span className="text-white font-semibold text-base block leading-tight">ACI Ads</span>
              <span className="text-[10px] text-gray-500 leading-none">Command Center</span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/settings' && pathname.startsWith(item.href + '/'));
          const Icon = item.icon;

          return (
            <div key={item.href} className="relative group">
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-600/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50 border border-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
                {showExpanded && (
                  <>
                    <span className="whitespace-nowrap">{item.label}</span>
                    {item.showBadge && pendingCount > 0 && (
                      <span className="ml-auto bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                        {pendingCount}
                      </span>
                    )}
                  </>
                )}
                {/* Collapsed: small dot for pending approvals */}
                {!showExpanded && item.showBadge && pendingCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </Link>
              {/* Tooltip on hover in collapsed state */}
              {!showExpanded && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-lg border border-gray-700 z-50">
                  {item.label}
                  {item.showBadge && pendingCount > 0 && ` (${pendingCount})`}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Toggle + Connection status */}
      <div className="border-t border-gray-800">
        {/* Toggle button */}
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-500 hover:text-white hover:bg-gray-800/50 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5 shrink-0" /> : <PanelLeftClose className="w-5 h-5 shrink-0" />}
          {showExpanded && <span className="text-xs whitespace-nowrap">Collapse sidebar</span>}
        </button>

        {/* Connection status */}
        <div className={`px-3 py-3 flex items-center gap-2 ${showExpanded ? '' : 'justify-center'}`}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {showExpanded && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {connected ? 'Google Ads Connected' : 'Google Ads Disconnected'}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
