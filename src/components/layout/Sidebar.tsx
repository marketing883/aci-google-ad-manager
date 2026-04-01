'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Megaphone, CheckSquare, Search,
  MessageSquare, Settings, ScrollText,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, showBadge: true },
  { href: '/research', label: 'Research', icon: Search },
  { href: '/chat', label: 'AI Chat', icon: MessageSquare },
  { href: '/logs', label: 'Agent Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchCounts() {
    try {
      const [appRes, connRes] = await Promise.all([
        fetch('/api/approvals?status=pending&limit=1').then((r) => r.json()),
        fetch('/api/google-ads/auth/status').then((r) => r.json()),
      ]);
      setPendingCount(Array.isArray(appRes) ? appRes.length : 0);
      setConnected(connRes.connected || false);
    } catch { /* ignore */ }
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-40">
      <div className="h-16 flex items-center px-6 border-b border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">A</div>
          <span className="text-white font-semibold text-lg">ACI Ads</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              <Icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
              {item.showBadge && pendingCount > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{pendingCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-600'}`} />
          <span>Google Ads: {connected ? 'Connected' : 'Not Connected'}</span>
        </div>
      </div>
    </aside>
  );
}
