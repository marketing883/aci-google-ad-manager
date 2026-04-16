'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Search,
  Send,
  Square,
  Wrench,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AynMark } from '@/components/brand/Ayn';
import { cn } from '@/lib/utils';
import { useChat, type HarnessEvent } from '@/hooks/useChat';
import { useChatPanel } from './layout/ChatPanelContext';

// ============================================================
// Event card (compact version for panel)
// ============================================================

function EventCard({ event }: { event: HarnessEvent }) {
  switch (event.type) {
    case 'stage':
      return (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="h-3 w-3 animate-spin text-info" />
          <span className="text-xs text-info">{event.content}</span>
        </div>
      );
    case 'tool_start':
      return (
        <div className="flex animate-pulse items-center gap-2 py-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{event.summary}</span>
        </div>
      );
    case 'tool_done':
      return (
        <div className="flex items-center gap-2 py-1">
          <CheckCircle className="h-3 w-3 text-success" />
          <span className="text-xs text-foreground">{event.summary}</span>
        </div>
      );
    case 'campaign_ready':
      return (
        <div className="flex items-center gap-2 py-1">
          <Wrench className="h-3 w-3 text-accent" />
          <Link
            href={`/portfolio/${event.campaign_id}`}
            className="text-xs text-accent hover:underline"
          >
            Campaign ready — view details
          </Link>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-2 py-1">
          <AlertCircle className="h-3 w-3 text-critical" />
          <span className="text-xs text-critical">{event.content}</span>
        </div>
      );
    case 'done':
      if (event.approval_ids?.length) {
        return (
          <div className="flex items-center gap-2 py-1">
            <CheckCircle className="h-3 w-3 text-success" />
            <Link
              href="/approvals"
              className="text-xs text-success hover:underline"
            >
              Submitted for approval
            </Link>
          </div>
        );
      }
      return null;
    default:
      return null;
  }
}

// ============================================================
// Chat Panel (slide-out from right)
// ============================================================

export function ChatPanel() {
  const { isOpen, context, initialMessage, closeChat } = useChatPanel();
  const {
    messages,
    input,
    setInput,
    isLoading,
    liveEvents,
    sendMessage,
    loadHistory,
    stopGeneration,
  } = useChat({ context });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      initialSent.current = false;
    }
  }, [isOpen, loadHistory]);

  useEffect(() => {
    if (isOpen && initialMessage && !initialSent.current && messages.length >= 0) {
      initialSent.current = true;
      setTimeout(() => sendMessage(initialMessage), 300);
    }
  }, [isOpen, initialMessage, messages.length, sendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEvents]);

  function handleSend() {
    if (input.trim()) sendMessage(input.trim());
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[45] bg-background/60 backdrop-blur-sm transition-opacity"
          onClick={closeChat}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[40vw] min-w-[400px] max-w-[700px] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <AynMark size={22} animated={isLoading} />
            <span className="text-sm font-semibold text-foreground">
              Ayn
            </span>
            {context && (
              <Badge variant="muted" className="normal-case">
                {context.page}
                {context.entityName ? `: ${context.entityName}` : ''}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={closeChat}
            aria-label="Close chat panel"
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center">
                <AynMark size={44} />
              </div>
              <p className="text-sm font-medium text-foreground">Ayn is listening</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask anything about your campaigns, performance, or strategy.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex',
                msg.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'overflow-hidden rounded-md px-3 py-2 text-sm',
                  msg.role === 'user'
                    ? 'max-w-[85%] bg-primary text-primary-foreground'
                    : 'w-full border border-border bg-background text-foreground',
                )}
              >
                {msg.role === 'assistant' ? (
                  <div className="overflow-x-auto">
                    {msg.events?.map((event, i) => (
                      <EventCard key={i} event={event} />
                    ))}
                    {msg.content && (
                      <div
                        className="prose prose-invert prose-xs max-w-none
                          [&>p]:mb-2 [&>p]:leading-relaxed
                          [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:text-[10px]
                          [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-foreground
                          [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-accent
                          [&_li]:text-xs [&_li]:text-muted-foreground
                          [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-[10px]
                          [&_strong]:text-foreground
                          [&_table]:mb-3 [&_table]:w-full [&_table]:text-[10px]
                          [&_td]:border-b [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1 [&_td]:text-muted-foreground
                          [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground
                          [&_thead]:bg-muted/50
                          [&_ul]:mb-2"
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap break-words text-sm">
                    {msg.content}
                  </span>
                )}
                <div
                  className={cn(
                    'mt-1 text-[9px]',
                    msg.role === 'user'
                      ? 'text-primary-foreground/60'
                      : 'text-muted-foreground',
                  )}
                >
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && liveEvents.length > 0 && (
            <Card className="px-3 py-2">
              {liveEvents.slice(-5).map((event, i) => (
                <EventCard key={i} event={event} />
              ))}
            </Card>
          )}

          {isLoading && liveEvents.length === 0 && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-muted-foreground">Thinking…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                context?.entityName
                  ? `Ask about ${context.entityName}…`
                  : 'Ask anything…'
              }
              disabled={isLoading}
            />
            {isLoading ? (
              <Button
                variant="outline"
                size="icon"
                onClick={stopGeneration}
                className="text-critical hover:text-critical"
                aria-label="Stop generation"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-center text-[9px] text-muted-foreground">
            Cmd+K to toggle · Esc to close
          </p>
        </div>
      </aside>
    </>
  );
}
