'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Send, Sparkles, Trash2, CheckCircle, AlertCircle, Search, Wrench, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

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
// Subcomponents
// ============================================================

function EventCard({ event }: { event: HarnessEvent }) {
  switch (event.type) {
    case 'stage':
      return (
        <div className="flex items-center gap-2 py-2">
          <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
            <Loader2 className="w-3 h-3 text-white animate-spin" />
          </div>
          <span className="text-sm font-medium text-blue-400">{event.content}</span>
        </div>
      );

    case 'tool_start':
      return (
        <div className="flex items-center gap-2 py-1 pl-7">
          <Search className="w-3.5 h-3.5 text-gray-500 animate-pulse" />
          <span className="text-xs text-gray-400">{event.summary}</span>
        </div>
      );

    case 'tool_done':
      return (
        <div className="flex items-center gap-2 py-1 pl-7">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs text-gray-300">{event.summary}</span>
        </div>
      );

    case 'thinking':
      return null; // Rendered as markdown in the main content

    case 'question':
      return null; // Rendered separately as question cards

    case 'campaign_ready':
      return (
        <div className="flex items-center gap-2 py-2 pl-7">
          <Wrench className="w-3.5 h-3.5 text-purple-400" />
          <Link href={`/campaigns/${event.campaign_id}`} className="text-xs text-purple-400 hover:text-purple-300 underline">
            View campaign in editor
          </Link>
        </div>
      );

    case 'error':
      return (
        <div className="flex items-center gap-2 py-1 pl-7">
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs text-red-400">{event.content}</span>
        </div>
      );

    case 'done':
      if (event.approval_ids && event.approval_ids.length > 0) {
        return (
          <div className="flex items-center gap-2 py-2 pl-7">
            <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            <Link href="/approvals" className="text-xs text-green-400 hover:text-green-300 underline">
              {event.approval_ids.length} item(s) in approval queue — review now
            </Link>
          </div>
        );
      }
      return null;

    default:
      return null;
  }
}

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
    <div className="bg-gray-900 border border-purple-800/50 rounded-xl p-4 space-y-3">
      {context && <p className="text-xs text-gray-400">{context}</p>}
      {questions.map((q, i) => (
        <div key={i}>
          <label className="block text-sm text-gray-300 mb-1">{q}</label>
          <input
            type="text"
            value={answers[i] || ''}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && Object.keys(answers).length === questions.length && handleSubmit()}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Your answer..."
          />
        </div>
      ))}
      <button
        onClick={handleSubmit}
        disabled={Object.keys(answers).length === 0}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors"
      >
        Submit Answers
      </button>
    </div>
  );
}

// ============================================================
// Suggestions
// ============================================================

const SUGGESTIONS = [
  'Create a search campaign for cloud consulting targeting US enterprises with $50/day budget',
  'Research keywords for Dynamics 365 implementation services',
  'How are my campaigns performing?',
  'Optimize my active campaigns',
];

// ============================================================
// Main Chat Page
// ============================================================

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveEvents, setLiveEvents] = useState<HarnessEvent[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<HarnessEvent | null>(null);
  const [pipelineContext, setPipelineContext] = useState<unknown>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prefillHandled = useRef(false);

  // Load chat history on mount + handle prefill from URL
  useEffect(() => {
    loadHistory().then(() => {
      // Handle ?prefill= from portfolio/briefing/intelligence clicks
      // searchParams.get() already decodes — don't double-decode
      const prefill = searchParams.get('prefill');
      if (prefill && !prefillHandled.current) {
        prefillHandled.current = true;
        setInput(prefill);
        // Send directly using the prefill text (not stale handleSend closure)
        sendMessage(prefill);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEvents, isLoading]);

  async function loadHistory() {
    try {
      const res = await fetch('/api/chat/history?limit=50');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setMessages(data.map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at),
        })));
      }
    } catch { /* ignore */ }
  }

  async function clearHistory() {
    try {
      await fetch('/api/chat/history', { method: 'DELETE' });
      setMessages([]);
      setLiveEvents([]);
      setPendingQuestion(null);
      setPipelineContext(null);
    } catch { /* ignore */ }
  }

  // Core send function — used by handleSend, prefill, and question answers
  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading) return;

    // Add user message
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
        body: JSON.stringify({
          message: messageText,
          pipelineContext,
        }),
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event: HarnessEvent = JSON.parse(data);
            collectedEvents.push(event);
            setLiveEvents((prev) => [...prev, event]);

            // Accumulate thinking text
            if (event.type === 'thinking' && event.content) {
              thinkingText += event.content + '\n';
            }

            // Handle question — pause for user input
            if (event.type === 'question') {
              setPendingQuestion(event);
            }
          } catch {
            // Skip unparseable events
          }
        }
      }

      // Create assistant message from collected events
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
    }

    setIsLoading(false);
  }

  // UI send handler — uses input state
  async function handleSend(overrideMessage?: string) {
    sendMessage((overrideMessage || input).trim());
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">AI Campaign Assistant</h1>
        </div>
        {messages.length > 0 && (
          <button onClick={clearHistory} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-12 h-12 text-purple-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">What would you like to do?</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-md">
              Tell me what you need — I'll research, build, and optimize your Google Ads campaigns. Everything goes through your approval.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} onClick={() => setInput(suggestion)} className="text-left p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:border-gray-700 transition-colors">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-3xl px-4 py-3 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-900 border border-gray-800 text-gray-200'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div>
                      {/* Render events (tool calls, stages) */}
                      {msg.events?.map((event, i) => (
                        <EventCard key={i} event={event} />
                      ))}
                      {/* Render thinking text as markdown */}
                      {msg.content && (
                        <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {/* Live streaming events */}
            {isLoading && liveEvents.length > 0 && (
              <div className="flex justify-start">
                <div className="max-w-3xl px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-sm">
                  {liveEvents.map((event, i) => (
                    <EventCard key={i} event={event} />
                  ))}
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && liveEvents.length === 0 && (
              <div className="flex justify-start">
                <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-gray-400">Starting up...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Pending question cards */}
            {pendingQuestion && !isLoading && (
              <QuestionCards
                questions={pendingQuestion.questions || []}
                context={pendingQuestion.context}
                onAnswer={(answer) => handleSend(answer)}
              />
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 pt-4">
        <div className="flex gap-3 items-end">
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
            placeholder="Tell me what you want to do... (Shift+Enter for new line)"
            rows={1}
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-hidden"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl transition-colors shrink-0"
            style={{ height: '48px' }}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
