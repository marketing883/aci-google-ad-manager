'use client';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SetupBanner } from '../SetupBanner';
import { SidebarProvider, useSidebar } from './SidebarContext';

function AppContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Sidebar />
      <TopBar />
      <main className={`pt-16 transition-all duration-200 ease-in-out ${collapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="p-6">
          <SetupBanner />
          {children}
        </div>
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppContent>{children}</AppContent>
    </SidebarProvider>
  );
}
