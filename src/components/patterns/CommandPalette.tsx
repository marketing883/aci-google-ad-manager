"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CheckSquare,
  Eye,
  MessageSquare,
  PieChart,
  Plus,
  Radar,
  RefreshCw,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useChatPanel } from "@/components/layout/ChatPanelContext";
import { api } from "@/lib/api-client";

interface CommandAction {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
  shortcut?: string;
  onSelect: () => void | Promise<void>;
}

/**
 * Global command palette triggered by Cmd+K / Ctrl+K.
 * Provides navigation, chat, and action shortcuts from anywhere in the app.
 *
 * Mounted once at the AppShell level. Listens for the keyboard shortcut
 * globally and renders as a <Dialog> overlay when open.
 */
export function CommandPalette() {
  const router = useRouter();
  const { openChat } = useChatPanel();
  const [open, setOpen] = useState(false);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  function runThenClose(fn: () => void | Promise<void>) {
    return async () => {
      setOpen(false);
      await fn();
    };
  }

  // Build action list
  const navigation: CommandAction[] = [
    {
      id: "nav-briefing",
      label: "Briefing",
      icon: Zap,
      keywords: "intelligence feed insights home",
      onSelect: runThenClose(() => router.push("/briefing")),
    },
    {
      id: "nav-chat",
      label: "Chat with Pilot",
      icon: MessageSquare,
      keywords: "ai assistant prompt talk",
      onSelect: runThenClose(() => router.push("/chat")),
    },
    {
      id: "nav-portfolio",
      label: "Portfolio",
      icon: PieChart,
      keywords: "campaigns health spend budget",
      onSelect: runThenClose(() => router.push("/portfolio")),
    },
    {
      id: "nav-intelligence",
      label: "Intelligence",
      icon: Radar,
      keywords: "competitor war room tracking",
      onSelect: runThenClose(() => router.push("/intelligence")),
    },
    {
      id: "nav-visibility",
      label: "Visibility",
      icon: Eye,
      keywords: "brand seo aeo analytics search",
      onSelect: runThenClose(() => router.push("/visibility")),
    },
    {
      id: "nav-approvals",
      label: "Approvals",
      icon: CheckSquare,
      keywords: "queue pending review actions",
      onSelect: runThenClose(() => router.push("/approvals")),
    },
    {
      id: "nav-logs",
      label: "Agent logs",
      icon: ScrollText,
      keywords: "history agent actions tokens audit",
      onSelect: runThenClose(() => router.push("/logs")),
    },
    {
      id: "nav-settings",
      label: "Settings",
      icon: SettingsIcon,
      keywords: "configuration ga4 google ads profile",
      onSelect: runThenClose(() => router.push("/settings")),
    },
  ];

  const actions: CommandAction[] = [
    {
      id: "action-open-chat",
      label: "Open AI chat panel",
      icon: Sparkles,
      keywords: "assistant",
      shortcut: "⌘J",
      onSelect: runThenClose(() => openChat()),
    },
    {
      id: "action-new-campaign",
      label: "New campaign (via chat)",
      icon: Plus,
      keywords: "create build generate",
      onSelect: runThenClose(() =>
        router.push(
          `/chat?prefill=${encodeURIComponent("Help me create a new search campaign. Ask me the required details.")}`,
        ),
      ),
    },
    {
      id: "action-new-visibility-report",
      label: "New visibility report",
      icon: Search,
      keywords: "scan brand seo aeo check rankings",
      onSelect: runThenClose(() => router.push("/visibility/new")),
    },
    {
      id: "action-sync-ads",
      label: "Sync Google Ads performance",
      icon: RefreshCw,
      keywords: "refresh update data fetch",
      onSelect: runThenClose(async () => {
        try {
          await api.post("/api/performance/sync", {});
          toast.success("Performance data synced");
        } catch {
          /* api-client toast */
        }
      }),
    },
    {
      id: "action-analyze-competitors",
      label: "Analyze competitors (via chat)",
      icon: Bot,
      keywords: "competitor scan research market",
      onSelect: runThenClose(() =>
        router.push(
          `/chat?prefill=${encodeURIComponent("Scan the market and tell me who my top competitors are and what strategies they're using.")}`,
        ),
      ),
    },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.keywords ?? ""}`}
                onSelect={item.onSelect}
              >
                <Icon />
                <span>{item.label}</span>
                {item.shortcut && (
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.keywords ?? ""}`}
                onSelect={item.onSelect}
              >
                <Icon />
                <span>{item.label}</span>
                {item.shortcut && (
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
