'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Zap, MessageSquare, PieChart, Radar,
  CheckSquare, Settings, Activity,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/briefing', label: 'Briefing', icon: Zap, description: 'AI insights & alerts' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, description: 'Talk to your strategist' },
  { href: '/portfolio', label: 'Portfolio', icon: PieChart, description: 'Campaign health & spend' },
  { href: '/intelligence', label: 'Intelligence', icon: Radar, description: 'Competitor war room' },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, description: 'Review AI actions', showBadge: true },
  { href: '/settings', label: 'Settings', icon: Settings, description: 'Configuration' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [connected, setConnected] = useState(false);

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

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-800">
        <Link href="/briefing" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-white font-semibold text-base block leading-tight">ACI Ads</span>
            <span className="text-[10px] text-gray-500 leading-none">Command Center</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/settings' && pathname.startsWith(item.href + '/'));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-600/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50 border border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-400' : ''}`} />
              <span>{item.label}</span>
              {item.showBadge && pendingCount > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Connection status */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500">
            {connected ? 'Google Ads Connected' : 'Google Ads Disconnected'}
          </span>
        </div>
      </div>
    </aside>
  );
}
