"use client";

import * as React from "react";
import { Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AynMark } from "@/components/brand/Ayn";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type SuggestContentType =
  | "headline"
  | "description"
  | "keyword"
  | "negative_keyword";

interface AiSuggestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Type of content to generate — drives prompt template and validation. */
  contentType: SuggestContentType;

  /**
   * "add" mode: Ayn drafts N new items, user accepts some/all.
   * "rewrite" mode: Ayn rewrites a SINGLE existing item; user picks one
   * variant and it REPLACES the original. currentText is required.
   */
  mode?: "add" | "rewrite";

  /** In rewrite mode, the text being rewritten. */
  currentText?: string;

  /** Freeform context the AI should know (campaign name, ad group theme, target audience). */
  context: string;

  /** Existing items so the AI knows what NOT to duplicate. */
  existingItems: string[];

  /** How many suggestions to ask for. Default 5 in add mode, 4 in rewrite. */
  count?: number;

  /** Called when the user clicks "Add" (add mode) or "Use this" (rewrite mode). */
  onAccept: (text: string) => void | Promise<void>;

  /** Called when the user clicks "Add all" (add mode only). */
  onAcceptAll?: (texts: string[]) => void | Promise<void>;
}

interface Suggestion {
  text: string;
  rationale?: string;
  accepted: boolean;
  adding: boolean;
}

const TYPE_CONFIG: Record<
  SuggestContentType,
  {
    addTitle: string;
    rewriteTitle: string;
    label: string;
    maxLength: number;
    placeholder: string;
    rewritePlaceholder: string;
  }
> = {
  headline: {
    addTitle: "Generate headlines",
    rewriteTitle: "Rewrite this headline",
    label: "headline",
    maxLength: 30,
    placeholder:
      "Make them benefit-focused for enterprise buyers. Emphasize ROI and Microsoft partnership.",
    rewritePlaceholder:
      "Make it punchier. Lead with a number. Or match the tone of the other headlines.",
  },
  description: {
    addTitle: "Generate descriptions",
    rewriteTitle: "Rewrite this description",
    label: "description",
    maxLength: 90,
    placeholder: "Each one should end with a clear CTA. Mention 15+ years of experience.",
    rewritePlaceholder:
      "Make the CTA stronger. Mention ROI. Or make it shorter.",
  },
  keyword: {
    addTitle: "Generate keywords",
    rewriteTitle: "Rewrite this keyword",
    label: "keyword",
    maxLength: 80,
    placeholder: "Focus on bottom-funnel intent. Mix broad and long-tail.",
    rewritePlaceholder: "Make it more specific. Or broader. Or add intent modifiers.",
  },
  negative_keyword: {
    addTitle: "Generate negative keywords",
    rewriteTitle: "Rewrite this negative keyword",
    label: "negative keyword",
    maxLength: 80,
    placeholder:
      "Block irrelevant traffic like 'jobs', 'careers', 'free tutorial', 'certification'.",
    rewritePlaceholder: "Broaden it to catch more variants. Or make it more specific.",
  },
};

/**
 * Ayn-powered content generation dialog.
 *
 * Users enter a freeform prompt describing what they want, Ayn returns
 * a list of suggestions with rationales, and the user can accept
 * individual items or all of them at once. Much better than navigating
 * to chat, typing a long prompt, and copying the output back manually.
 */
export function AiSuggestDialog({
  open,
  onOpenChange,
  contentType,
  mode = "add",
  currentText,
  context,
  existingItems,
  count,
  onAccept,
  onAcceptAll,
}: AiSuggestDialogProps) {
  const config = TYPE_CONFIG[contentType];
  const isRewrite = mode === "rewrite";
  const effectiveCount = count ?? (isRewrite ? 4 : 5);
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [acceptAllPending, setAcceptAllPending] = React.useState(false);

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setPrompt("");
      setSuggestions([]);
      setLoading(false);
    }
  }, [open]);

  async function generate() {
    setLoading(true);
    try {
      const result = await api.post<{
        suggestions: Array<{ text: string; rationale?: string }>;
      }>("/api/ai/suggest-content", {
        type: contentType,
        mode,
        current: currentText,
        context,
        existing: existingItems,
        prompt,
        count: effectiveCount,
      });
      setSuggestions(
        result.suggestions.map((s) => ({
          text: s.text,
          rationale: s.rationale,
          accepted: false,
          adding: false,
        })),
      );
    } catch {
      /* api-client surfaces error toast */
    } finally {
      setLoading(false);
    }
  }

  async function accept(idx: number) {
    const s = suggestions[idx];
    if (!s || s.accepted || s.adding) return;
    setSuggestions((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, adding: true } : x)),
    );
    try {
      await onAccept(s.text);
      // In rewrite mode, one pick means done — close the dialog.
      if (isRewrite) {
        onOpenChange(false);
        return;
      }
      setSuggestions((prev) =>
        prev.map((x, i) =>
          i === idx ? { ...x, accepted: true, adding: false } : x,
        ),
      );
    } catch {
      setSuggestions((prev) =>
        prev.map((x, i) => (i === idx ? { ...x, adding: false } : x)),
      );
    }
  }

  async function acceptAll() {
    const toAdd = suggestions.filter((s) => !s.accepted).map((s) => s.text);
    if (toAdd.length === 0) return;
    setAcceptAllPending(true);
    try {
      if (onAcceptAll) {
        await onAcceptAll(toAdd);
      } else {
        for (const text of toAdd) {
          await onAccept(text);
        }
      }
      setSuggestions((prev) =>
        prev.map((s) => ({ ...s, accepted: true, adding: false })),
      );
      toast.success(`Added ${toAdd.length} ${config.label}${toAdd.length === 1 ? "" : "s"}`);
    } catch {
      /* silent */
    } finally {
      setAcceptAllPending(false);
    }
  }

  const allAccepted =
    suggestions.length > 0 && suggestions.every((s) => s.accepted);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center">
              <AynMark size={40} animated={loading} />
            </div>
            <div>
              <DialogTitle>
                {isRewrite ? config.rewriteTitle : config.addTitle}
              </DialogTitle>
              <DialogDescription>
                {isRewrite
                  ? `Ayn will draft ${effectiveCount} variations. Pick the one you like — it replaces the original.`
                  : `Ayn will draft ${effectiveCount} ${config.label}s based on the context below. Accept what you like — skip the rest.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Current text callout in rewrite mode */}
        {isRewrite && currentText && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Current {config.label}
            </p>
            <p className="text-sm text-foreground">{currentText}</p>
          </div>
        )}

        {/* Prompt input */}
        <div className="space-y-1.5">
          <Label htmlFor="ai-suggest-prompt">
            {isRewrite ? "How should Ayn change it?" : "What should Ayn focus on?"}{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="ai-suggest-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isRewrite ? config.rewritePlaceholder : config.placeholder
            }
            rows={2}
            disabled={loading}
          />
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {suggestions.length}{" "}
                {isRewrite ? "variation" : "suggestion"}
                {suggestions.length === 1 ? "" : "s"}
              </h4>
              {!isRewrite && !allAccepted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={acceptAll}
                  disabled={acceptAllPending}
                >
                  {acceptAllPending && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  Add all
                </Button>
              )}
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "group flex items-start gap-3 rounded-md border p-3 transition-colors",
                    s.accepted
                      ? "border-success/30 bg-success/5"
                      : "border-border bg-muted/20 hover:bg-muted/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm",
                        s.accepted
                          ? "text-success line-through"
                          : "text-foreground",
                      )}
                    >
                      {s.text}
                    </p>
                    {s.rationale && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.rationale}
                      </p>
                    )}
                    {s.text.length > config.maxLength && (
                      <Badge variant="warning" className="mt-1">
                        {s.text.length}/{config.maxLength} — trim needed
                      </Badge>
                    )}
                  </div>
                  {s.accepted ? (
                    <div className="flex h-7 items-center gap-1 px-2 text-xs text-success">
                      <Check className="h-3.5 w-3.5" />
                      {isRewrite ? "Used" : "Added"}
                    </div>
                  ) : (
                    <Button
                      variant={isRewrite ? "default" : "outline"}
                      size="sm"
                      onClick={() => accept(i)}
                      disabled={s.adding}
                      className="shrink-0"
                    >
                      {s.adding ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      {isRewrite ? "Use this" : "Add"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {suggestions.length === 0 ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={generate} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate with Ayn
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
                Done
              </Button>
              <Button
                variant="outline"
                onClick={generate}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Regenerate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
