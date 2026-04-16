"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Circle,
  Link2,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface SetupStatus {
  googleAds: { connected: boolean; customerId: string | null };
  ga4: { connected: boolean; propertyId: string | null };
  companyProfile: { configured: boolean };
  dataForSeo: { configured: boolean };
  overall: { stepsComplete: number; stepsTotal: number; ready: boolean };
}

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  cta: string;
}

const STEPS: Step[] = [
  {
    id: "googleAds",
    title: "Connect Google Ads",
    description: "Link the ad account your campaigns will push to.",
    href: "/settings/connection",
    icon: Link2,
    cta: "Connect",
  },
  {
    id: "ga4",
    title: "Link Google Analytics 4",
    description: "Powers cross-channel insights and behavior tracking.",
    href: "/settings",
    icon: BarChart3,
    cta: "Add property ID",
  },
  {
    id: "companyProfile",
    title: "Build your company profile",
    description: "Used by the AI to write better ads and target real competitors.",
    href: "/settings",
    icon: Building2,
    cta: "Set up",
  },
  {
    id: "dataForSeo",
    title: "Enable SEO/AEO tracking",
    description: "DataForSEO credentials unlock organic rankings and AI visibility.",
    href: "/settings",
    icon: Search,
    cta: "Configure",
  },
];

function getStepDone(id: string, status: SetupStatus): boolean {
  switch (id) {
    case "googleAds":
      return status.googleAds.connected && !!status.googleAds.customerId;
    case "ga4":
      return status.ga4.connected;
    case "companyProfile":
      return status.companyProfile.configured;
    case "dataForSeo":
      return status.dataForSeo.configured;
    default:
      return false;
  }
}

/**
 * Progressive onboarding checklist. Stays visible until every step is done,
 * then shows a celebratory "Ayn is watching" state that the user can
 * acknowledge to hide. State persists across sessions via localStorage.
 */
export function OnboardingChecklist() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);

  useEffect(() => {
    // Check if the "ready" state has been acknowledged
    const acknowledged = localStorage.getItem("onboarding_ready_acknowledged");
    if (acknowledged) {
      setHideCompleted(true);
    }

    api
      .get<SetupStatus>("/api/setup-status")
      .then((d) => {
        if (d.overall) setStatus(d);
      })
      .catch(() => {
        /* silent — checklist is non-critical */
      });

    // Restore expanded state
    const saved = localStorage.getItem("onboarding_expanded");
    if (saved === "false") setExpanded(false);
  }, []);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem("onboarding_expanded", String(next));
  }

  function acknowledgeComplete() {
    localStorage.setItem("onboarding_ready_acknowledged", new Date().toISOString());
    setHideCompleted(true);
  }

  if (!status) return null;

  const allDone = status.overall.stepsComplete === status.overall.stepsTotal;
  if (allDone && hideCompleted) return null;

  const pct = (status.overall.stepsComplete / status.overall.stepsTotal) * 100;

  return (
    <Card
      className={cn(
        "relative mb-6 overflow-hidden",
        allDone ? "border-success/30 bg-success/5" : "border-info/30 bg-info/5",
      )}
    >
      {/* Header */}
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
        aria-expanded={expanded}
        aria-controls="onboarding-steps"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
              allDone
                ? "border border-success/30 bg-success/10 text-success"
                : "border border-info/30 bg-info/10 text-info",
            )}
          >
            {allDone ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {allDone
                ? "Ayn is awake"
                : `Get set up (${status.overall.stepsComplete}/${status.overall.stepsTotal})`}
            </p>
            <p className="text-xs text-muted-foreground">
              {allDone
                ? "Every integration is connected. Ayn is reading the data and will surface recommendations."
                : "Finish the remaining steps to wake Ayn up and unlock the full platform."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden w-32 md:block">
            <Progress value={pct} />
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div id="onboarding-steps" className="border-t border-border px-4 py-3">
          <ol className="space-y-2">
            {STEPS.map((step) => {
              const done = getStepDone(step.id, status);
              const Icon = step.icon;
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3",
                    done
                      ? "border-success/20 bg-success/5"
                      : "border-border bg-background/40",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      done
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <p
                        className={cn(
                          "text-sm font-medium",
                          done
                            ? "text-success line-through opacity-70"
                            : "text-foreground",
                        )}
                      >
                        {step.title}
                      </p>
                    </div>
                    <p className="ml-5 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {!done && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={step.href}>
                        {step.cta}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>

          {allDone && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={acknowledgeComplete}>
                Got it
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
