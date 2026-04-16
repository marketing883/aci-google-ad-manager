'use client';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ChatPanel } from '../ChatPanel';
import { CommandPalette } from '@/components/patterns/CommandPalette';
import { OnboardingChecklist } from '@/components/patterns/OnboardingChecklist';
import { SidebarProvider, useSidebar } from './SidebarContext';
import { ChatPanelProvider } from './ChatPanelContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

function AppContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <TopBar />
      <main className={`pt-16 transition-all duration-200 ease-in-out ${collapsed ? 'ml-16' : 'ml-64'}`}>
        <div className="p-6">
          <OnboardingChecklist />
          {children}
        </div>
      </main>
      <ChatPanel />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <ChatPanelProvider>
          <AppContent>{children}</AppContent>
          <CommandPalette />
          <Toaster />
        </ChatPanelProvider>
      </SidebarProvider>
    </TooltipProvider>
  );
}
