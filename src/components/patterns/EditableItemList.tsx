"use client";

import * as React from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "muted"
  | "critical"
  | "warning"
  | "info"
  | "success"
  | "accent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface EditableItem {
  /** Stable key — either a DB UUID or a synthetic array-index string. */
  id: string;
  /** The displayed text. */
  text: string;
  /** Free-slot for keyword match_type, ad status, etc. */
  extra?: unknown;
}

interface EditableItemListProps {
  /** Section title shown above the list (e.g. "Keywords", "Headlines"). */
  title: string;
  /** Icon next to the title. */
  icon?: React.ReactNode;
  /** The items to render. */
  items: EditableItem[];
  /** Singular label for empty state + buttons ("keyword", "headline"). */
  itemLabel: string;
  /** Placeholder in the add-input. */
  placeholder?: string;
  /** Max character count for the input. */
  maxLength?: number;
  /** Hard cap on items (e.g. RSA allows 15 headlines / 4 descriptions). */
  maxItems?: number;

  /** Called when the user submits the inline add form. */
  onAdd: (text: string) => void | Promise<void>;
  /** Called when the user confirms an edit. */
  onEdit: (item: EditableItem, newText: string) => void | Promise<void>;
  /** Called when the user clicks delete. */
  onDelete: (item: EditableItem) => void | Promise<void>;
  /** If provided, shows a ✨ Generate button in the header (bulk add). */
  onAiSuggest?: () => void;
  /**
   * If provided, shows a ✨ sparkle icon next to each item that triggers
   * a "rewrite this item" flow. Called with the item to rewrite.
   */
  onAiRewriteItem?: (item: EditableItem) => void;

  /** Variant controls badge styling. "keyword" = match-type chips, "ad" = text lines. */
  layout?: "badges" | "lines";
  /** For badge layout: render function for the text (e.g. wrap with quotes for PHRASE match). */
  renderBadgeText?: (item: EditableItem) => React.ReactNode;
  /** For badge layout: which badge variant to use per item. */
  badgeVariantFor?: (item: EditableItem) => BadgeVariant;

  /** Character count limit shown in the footer (e.g. "3/15 headlines"). */
  showCount?: boolean;

  className?: string;
}

/**
 * Reusable inline-editable list with add/edit/delete + optional AI suggest.
 *
 * Used across Portfolio detail for keywords, negative keywords, headlines, and
 * descriptions. Two layouts:
 *
 *   - "badges" — items render as Badge chips with hover-reveal delete.
 *     Best for keywords where text is short and many items per row.
 *   - "lines" — items render as full-width rows with edit/delete buttons.
 *     Best for headlines and descriptions where text is longer and users
 *     want to rewrite specific items.
 *
 * All async mutations show a pending spinner inline so users see the
 * action completing without full-page loading states.
 */
export function EditableItemList({
  title,
  icon,
  items,
  itemLabel,
  placeholder,
  maxLength,
  maxItems,
  onAdd,
  onEdit,
  onDelete,
  onAiSuggest,
  onAiRewriteItem,
  layout = "badges",
  renderBadgeText,
  badgeVariantFor,
  showCount = false,
  className,
}: EditableItemListProps) {
  const [adding, setAdding] = React.useState(false);
  const [addText, setAddText] = React.useState("");
  const [addPending, setAddPending] = React.useState(false);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [editPending, setEditPending] = React.useState(false);

  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const atCapacity = typeof maxItems === "number" && items.length >= maxItems;

  async function handleAddSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = addText.trim();
    if (!text) return;
    setAddPending(true);
    try {
      await onAdd(text);
      setAddText("");
      setAdding(false);
    } catch {
      /* parent already surfaces a toast via api-client */
    } finally {
      setAddPending(false);
    }
  }

  async function handleEditSubmit(item: EditableItem, e?: React.FormEvent) {
    e?.preventDefault();
    const text = editText.trim();
    if (!text || text === item.text) {
      setEditingId(null);
      return;
    }
    setEditPending(true);
    try {
      await onEdit(item, text);
      setEditingId(null);
    } catch {
      /* silent — toast from parent */
    } finally {
      setEditPending(false);
    }
  }

  async function handleDelete(item: EditableItem) {
    setDeletingId(item.id);
    try {
      await onDelete(item);
    } catch {
      /* silent */
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(item: EditableItem) {
    setEditingId(item.id);
    setEditText(item.text);
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header: icon + title + count + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon ?? <Tag className="h-3.5 w-3.5 text-muted-foreground" />}
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </h4>
          {showCount && (
            <span className="text-[10px] text-muted-foreground">
              {items.length}
              {typeof maxItems === "number" ? ` / ${maxItems}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onAiSuggest && !atCapacity && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAiSuggest}
                  className="h-7 text-accent hover:bg-accent/10 hover:text-accent"
                  aria-label={`Generate ${itemLabel}s with Ayn`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Generate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Let Ayn draft new {itemLabel}s for you
              </TooltipContent>
            </Tooltip>
          )}
          {atCapacity && onAiRewriteItem && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default text-[10px] text-muted-foreground">
                  At capacity — click ✨ on any item to rewrite
                </span>
              </TooltipTrigger>
              <TooltipContent>
                You&apos;ve reached the max of {maxItems} {itemLabel}s. Use the
                per-item rewrite icon to improve existing ones.
              </TooltipContent>
            </Tooltip>
          )}
          {!adding && !atCapacity && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              className="h-7"
              aria-label={`Add ${itemLabel}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          )}
        </div>
      </div>

      {/* Items */}
      {layout === "badges" ? (
        <div className="flex flex-wrap gap-1.5">
          {items.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground">
              No {itemLabel}s yet.{" "}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Add one
              </button>
              {onAiSuggest && (
                <>
                  {" or "}
                  <button
                    type="button"
                    onClick={onAiSuggest}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    generate with AI
                  </button>
                </>
              )}
              .
            </p>
          )}
          {items.map((item) =>
            editingId === item.id ? (
              <form
                key={item.id}
                onSubmit={(e) => handleEditSubmit(item, e)}
                className="flex items-center gap-1"
              >
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  maxLength={maxLength}
                  className="h-7 w-48 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={editPending}
                  aria-label="Save edit"
                >
                  {editPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 text-success" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingId(null)}
                  aria-label="Cancel edit"
                >
                  <X className="h-3 w-3" />
                </Button>
              </form>
            ) : (
              <div
                key={item.id}
                className="group/item relative inline-flex items-center"
              >
                <Badge
                  variant={badgeVariantFor?.(item) ?? "muted"}
                  className={cn(
                    "normal-case transition-all group-hover/item:bg-muted",
                    onAiRewriteItem
                      ? "pr-9 group-hover/item:pr-20"
                      : "pr-9 group-hover/item:pr-14",
                  )}
                >
                  {renderBadgeText?.(item) ?? item.text}
                </Badge>
                {/* Hover actions */}
                <div className="pointer-events-none absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100">
                  {onAiRewriteItem && (
                    <button
                      type="button"
                      onClick={() => onAiRewriteItem(item)}
                      className="flex h-5 w-5 items-center justify-center rounded text-accent hover:bg-background"
                      aria-label={`Rewrite ${itemLabel} with Ayn`}
                      title="Rewrite with Ayn"
                    >
                      <Sparkles className="h-2.5 w-2.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={`Edit ${itemLabel}`}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-critical"
                    aria-label={`Delete ${itemLabel}`}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-2.5 w-2.5" />
                    )}
                  </button>
                </div>
              </div>
            ),
          )}

          {/* Inline add form for badges layout */}
          {adding && (
            <form
              onSubmit={handleAddSubmit}
              className="flex items-center gap-1"
            >
              <Input
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder={placeholder ?? `New ${itemLabel}…`}
                autoFocus
                maxLength={maxLength}
                className="h-7 w-48 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddText("");
                  }
                }}
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={addPending || !addText.trim()}
                aria-label={`Save ${itemLabel}`}
              >
                {addPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 text-success" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setAdding(false);
                  setAddText("");
                }}
                aria-label="Cancel add"
              >
                <X className="h-3 w-3" />
              </Button>
            </form>
          )}
        </div>
      ) : (
        /* "lines" layout — full-width rows for headlines/descriptions */
        <div className="space-y-1.5">
          {items.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground">
              No {itemLabel}s yet.{" "}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Add one
              </button>
              {onAiSuggest && (
                <>
                  {" or "}
                  <button
                    type="button"
                    onClick={onAiSuggest}
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    generate with AI
                  </button>
                </>
              )}
              .
            </p>
          )}
          {items.map((item, i) =>
            editingId === item.id ? (
              <form
                key={item.id}
                onSubmit={(e) => handleEditSubmit(item, e)}
                className="flex items-start gap-2"
              >
                <span className="mt-2 text-[10px] font-mono text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  maxLength={maxLength}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                {maxLength && (
                  <span className="mt-2.5 w-10 text-right text-[10px] font-mono text-muted-foreground">
                    {editText.length}/{maxLength}
                  </span>
                )}
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  disabled={editPending}
                  aria-label="Save edit"
                >
                  {editPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-success" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setEditingId(null)}
                  aria-label="Cancel edit"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </form>
            ) : (
              <div
                key={item.id}
                className="group/row flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-border/80 hover:bg-muted/40"
              >
                <span className="mt-0.5 text-[10px] font-mono text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="flex-1 text-sm text-foreground">{item.text}</p>
                {maxLength && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {item.text.length}
                  </span>
                )}
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
                  {onAiRewriteItem && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-accent hover:bg-accent/10 hover:text-accent"
                          onClick={() => onAiRewriteItem(item)}
                          aria-label={`Rewrite this ${itemLabel} with Ayn`}
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Rewrite with Ayn
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => startEdit(item)}
                    aria-label={`Edit ${itemLabel}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-critical"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    aria-label={`Delete ${itemLabel}`}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            ),
          )}
          {adding && (
            <form onSubmit={handleAddSubmit} className="flex items-start gap-2">
              <span className="mt-2.5 text-[10px] font-mono text-muted-foreground">
                {String(items.length + 1).padStart(2, "0")}
              </span>
              <Input
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                placeholder={placeholder ?? `New ${itemLabel}…`}
                autoFocus
                maxLength={maxLength}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddText("");
                  }
                }}
              />
              {maxLength && (
                <span className="mt-2.5 w-10 text-right text-[10px] font-mono text-muted-foreground">
                  {addText.length}/{maxLength}
                </span>
              )}
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={addPending || !addText.trim()}
                aria-label={`Save ${itemLabel}`}
              >
                {addPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5 text-success" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => {
                  setAdding(false);
                  setAddText("");
                }}
                aria-label="Cancel add"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Helper: toast + log for parent handlers that want to surface errors
 * without rolling their own logic.
 */
export function reportMutationError(err: unknown, label: string) {
  const message = err instanceof Error ? err.message : `Failed to update ${label}`;
  toast.error(message);
}
