'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AynMark } from '@/components/brand/Ayn';
import { ConfirmDialog } from '@/components/patterns/ConfirmDialog';
import { PageHeader } from '@/components/patterns/PageHeader';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: HarnessEvent[];
  timestamp: Date;
}

interface HarnessEvent {
  type: string;
  stage?: string;
  content?: string;
  tool?: string;
  summary?: string;
  questions?: string[];
  context?: string;
  campaign_id?: string;
  approval_ids?: string[];
  data?: unknown;
}

// ============================================================
// Event cards (tool calls, stages, etc.)
// ============================================================

function EventCard({ event }: { event: HarnessEvent }) {
  switch (event.type) {
    case 'stage':
      return (
        <div className="flex items-center gap-2 py-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-info/20">
            <Loader2 className="h-3 w-3 animate-spin text-info" />
          </div>
          <span className="text-sm font-medium text-info">{event.content}</span>
        </div>
      );
    case 'tool_start':
      return (
        <div className="flex items-center gap-2 py-0.5 pl-7">
          <Search className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{event.summary}</span>
        </div>
      );
    case 'tool_done':
      return (
        <div className="flex items-center gap-2 py-0.5 pl-7">
          <CheckCircle className="h-3.5 w-3.5 text-success" />
          <span className="text-xs text-foreground">{event.summary}</span>
        </div>
      );
    case 'thinking':
      return null; // Rendered as markdown in the main content
    case 'question':
      return null; // Rendered separately as question cards
    case 'campaign_ready':
      return (
        <div className="flex items-center gap-2 py-1.5 pl-7">
          <Wrench className="h-3.5 w-3.5 text-accent" />
          <Link
            href={`/campaigns/${event.campaign_id}`}
            className="text-xs font-medium text-accent underline-offset-2 hover:underline"
          >
            View campaign in editor
          </Link>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-2 py-1 pl-7">
          <AlertCircle className="h-3.5 w-3.5 text-critical" />
          <span className="text-xs text-critical">{event.content}</span>
        </div>
      );
    case 'done':
      if (event.approval_ids && event.approval_ids.length > 0) {
        return (
          <div className="flex items-center gap-2 py-1.5 pl-7">
            <CheckCircle className="h-3.5 w-3.5 text-success" />
            <Link
              href="/approvals"
              className="text-xs font-medium text-success underline-offset-2 hover:underline"
            >
              {event.approval_ids.length} item
              {event.approval_ids.length === 1 ? '' : 's'} in approval queue — review now
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
// Question cards — inline mini-form when the agent asks something
// ============================================================

function QuestionCards({
  questions,
  context,
  onAnswer,
}: {
  questions: string[];
  context?: string;
  onAnswer: (answer: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});

  function handleSubmit() {
    const combined = questions
      .map((q, i) => `${q}: ${answers[i] || '(not answered)'}`)
      .join('\n');
    onAnswer(combined);
  }

  return (
    <Card className="border-accent/30 bg-accent/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">
          I need a few details
        </h3>
      </div>
      {context && (
        <p className="mb-3 text-xs text-muted-foreground">{context}</p>
      )}
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="space-y-1.5">
            <Label htmlFor={`q-${i}`}>{q}</Label>
            <Input
              id={`q-${i}`}
              value={answers[i] || ''}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  Object.keys(answers).length === questions.length
                ) {
                  handleSubmit();
                }
              }}
              placeholder="Your answer…"
            />
          </div>
        ))}
      </div>
      <Button
        onClick={handleSubmit}
        disabled={Object.keys(answers).length === 0}
        className="mt-4"
        size="sm"
      >
        <Send className="h-3.5 w-3.5" />
        Submit answers
      </Button>
    </Card>
  );
}

// ============================================================
// Suggestions
// ============================================================

const SUGGESTIONS = [
  {
    title: 'Build a new campaign',
    body: 'Create a search campaign for cloud consulting targeting US enterprises with $50/day budget',
  },
  {
    title: 'Research keywords',
    body: 'Research keywords for Dynamics 365 implementation services',
  },
  {
    title: 'Performance check',
    body: 'How are my campaigns performing?',
  },
  {
    title: 'Optimize spend',
    body: 'Optimize my active campaigns',
  },
];

// ============================================================
// Main chat page
// ============================================================

function ChatPageInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveEvents, setLiveEvents] = useState<HarnessEvent[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<HarnessEvent | null>(
    null,
  );
  const [pipelineContext, setPipelineContext] = useState<unknown>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefillHandled = useRef(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.get<
        Array<{ id: string; role: string; content: string; created_at: string }>
      >('/api/chat/history?limit=50');
      if (Array.isArray(data) && data.length > 0) {
        setMessages(
          data.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at),
          })),
        );
      }
    } catch {
      /* silent — empty history is fine */
    }
  }, []);

  // Core send function — used by handleSend, prefill, and question answers
  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isLoading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: messageText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setPendingQuestion(null);

      // Reset textarea height
      const textarea = document.querySelector('textarea');
      if (textarea) textarea.style.height = '48px';

      setIsLoading(true);
      setLiveEvents([]);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, pipelineContext }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let thinkingText = '';
        const collectedEvents: HarnessEvent[] = [];

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              streamDone = true;
              break;
            }

            try {
              const event: HarnessEvent = JSON.parse(data);
              collectedEvents.push(event);
              setLiveEvents((prev) => [...prev, event]);

              if (event.type === 'thinking' && event.content) {
                thinkingText += event.content + '\n';
              }
              if (event.type === 'question') {
                setPendingQuestion(event);
              }
              if (event.type === 'done') {
                streamDone = true;
                break;
              }
            } catch {
              /* skip unparseable events */
            }
          }
        }
        reader.releaseLock();

        if (thinkingText.trim() || collectedEvents.length > 0) {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: thinkingText.trim() || 'Done.',
            events: collectedEvents,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
        setLiveEvents([]);
      } catch (error) {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        toast.error('The agent ran into an error');
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, pipelineContext],
  );

  // Load chat history on mount + handle prefill from URL
  useEffect(() => {
    loadHistory().then(() => {
      const prefill = searchParams.get('prefill');
      if (prefill && !prefillHandled.current) {
        prefillHandled.current = true;
        setInput(prefill);
        sendMessage(prefill);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEvents, isLoading]);

  async function clearHistory() {
    try {
      await api.delete('/api/chat/history');
      setMessages([]);
      setLiveEvents([]);
      setPendingQuestion(null);
      setPipelineContext(null);
      toast.success('History cleared');
    } catch {
      /* api-client toast */
    }
  }

  async function handleSend(overrideMessage?: string) {
    sendMessage((overrideMessage || input).trim());
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        icon={<AynMark size={22} aria-label="" />}
        title="Chat with Ayn"
        description="Tell me what you need — I'll research, build, and optimize. Everything goes through your approval."
        actions={
          messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </Button>
          )
        }
      />

      {/* Messages */}
      <div className="-mx-6 mt-6 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              What would you like to do?
            </h2>
            <p className="mb-6 max-w-md text-sm text-muted-foreground">
              I research, build, and optimize Google Ads campaigns. Everything
              goes through your approval.
            </p>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.title}
                  onClick={() => setInput(suggestion.body)}
                  className="group rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-border/80 hover:bg-muted/30"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {suggestion.title}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {suggestion.body}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
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
                    'max-w-3xl rounded-lg px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-foreground',
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <div>
                      {msg.events?.map((event, i) => (
                        <EventCard key={i} event={event} />
                      ))}
                      {msg.content && (
                        <div className="prose prose-invert prose-sm max-w-none [&>ol]:mb-2 [&>p]:mb-2 [&>table]:mb-3 [&>table]:w-full [&>ul]:mb-2">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({ children }) => (
                                <div className="my-3 overflow-x-auto rounded-md border border-border">
                                  <table className="w-full border-collapse text-xs">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => (
                                <thead className="bg-muted/60">{children}</thead>
                              ),
                              th: ({ children }) => (
                                <th className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-medium text-foreground">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="max-w-[300px] break-all border-b border-border/40 px-3 py-2 text-muted-foreground">
                                  {children}
                                </td>
                              ),
                              tr: ({ children }) => (
                                <tr className="hover:bg-muted/30">{children}</tr>
                              ),
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  className="break-all text-accent hover:underline"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                              code: ({ children }) => (
                                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                                  {children}
                                </code>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                  <div
                    className={cn(
                      'mt-1.5 text-[10px]',
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

            {/* Live streaming events */}
            {isLoading && liveEvents.length > 0 && (
              <div className="flex justify-start">
                <Card className="max-w-3xl px-4 py-3 text-sm">
                  <Badge variant="accent" className="mb-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Working
                  </Badge>
                  {liveEvents.map((event, i) => (
                    <EventCard key={i} event={event} />
                  ))}
                </Card>
              </div>
            )}

            {/* Initial loading indicator */}
            {isLoading && liveEvents.length === 0 && (
              <div className="flex justify-start">
                <Card className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:150ms]" />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Starting up…
                    </span>
                  </div>
                </Card>
              </div>
            )}

            {/* Pending question cards */}
            {pendingQuestion && !isLoading && (
              <div className="flex justify-start">
                <div className="max-w-3xl flex-1">
                  <QuestionCards
                    questions={pendingQuestion.questions || []}
                    context={pendingQuestion.context}
                    onAnswer={(answer) => handleSend(answer)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border pt-4">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = '48px';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Tell me what you want to do… (Shift+Enter for new line)"
            rows={1}
            className="flex-1 resize-none overflow-hidden rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="h-12 w-12 shrink-0"
            size="icon"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        title="Clear chat history?"
        description="This removes every message from this conversation. Your campaigns and approvals are unaffected."
        confirmLabel="Clear history"
        destructive
        onConfirm={clearHistory}
      />
    </div>
  );
}

// Suspense wrapper — required in Next 16 because useSearchParams() bails out
// of static prerendering. Without this, `next build` fails on /chat.
export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
