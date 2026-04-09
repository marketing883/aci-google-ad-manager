'use client';

import { useEffect, useRef } from 'react';
import { X, Send, Loader2, Sparkles, Square, CheckCircle, AlertCircle, Search, Wrench } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { useChatPanel } from './layout/ChatPanelContext';
import { useChat, type HarnessEvent } from '@/hooks/useChat';

// ============================================================
// Event Card (compact version for panel)
// ============================================================

function EventCard({ event }: { event: HarnessEvent }) {
  switch (event.type) {
    case 'stage':
      return (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          <span className="text-xs text-blue-400">{event.content}</span>
        </div>
      );
    case 'tool_start':
      return (
        <div className="flex items-center gap-2 py-1 animate-pulse">
          <Search className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-400">{event.summary}</span>
        </div>
      );
    case 'tool_done':
      return (
        <div className="flex items-center gap-2 py-1">
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-xs text-gray-300">{event.summary}</span>
        </div>
      );
    case 'campaign_ready':
      return (
        <div className="flex items-center gap-2 py-1">
          <Wrench className="w-3 h-3 text-purple-400" />
          <Link href={`/portfolio/${event.campaign_id}`} className="text-xs text-purple-400 hover:text-purple-300">
            Campaign ready — view details
          </Link>
        </div>
      );
    case 'error':
      return (
        <div className="flex items-center gap-2 py-1">
          <AlertCircle className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-400">{event.content}</span>
        </div>
      );
    case 'done':
      if (event.approval_ids?.length) {
        return (
          <div className="flex items-center gap-2 py-1">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <Link href="/approvals" className="text-xs text-green-400 hover:text-green-300">
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
    messages, input, setInput, isLoading, liveEvents,
    pendingQuestion, sendMessage, loadHistory, stopGeneration, setPendingQuestion,
  } = useChat({ context: context });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  // Load history when panel opens
  useEffect(() => {
    if (isOpen) {
      loadHistory();
      initialSent.current = false;
    }
  }, [isOpen, loadHistory]);

  // Send initial message if provided
  useEffect(() => {
    if (isOpen && initialMessage && !initialSent.current && messages.length >= 0) {
      initialSent.current = true;
      setTimeout(() => sendMessage(initialMessage), 300);
    }
  }, [isOpen, initialMessage, messages.length, sendMessage]);

  // Auto-scroll
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
        <div className="fixed inset-0 bg-black/20 z-[45] transition-opacity" onClick={closeChat} />
      )}

      {/* Panel */}
      <div className={`fixed right-0 top-0 h-full z-50 bg-gray-950 border-l border-gray-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out w-[40vw] min-w-[400px] max-w-[700px] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm">AI Assistant</span>
            {context && (
              <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                {context.page}{context.entityName ? `: ${context.entityName}` : ''}
              </span>
            )}
          </div>
          <button onClick={closeChat} className="text-gray-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <Sparkles className="w-8 h-8 text-purple-400/50 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Ask anything about your campaigns, performance, or strategy.</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900 border border-gray-800 text-gray-200'
              }`}>
                {msg.role === 'assistant' ? (
                  <div>
                    {msg.events?.map((event, i) => (
                      <EventCard key={i} event={event} />
                    ))}
                    {msg.content && (
                      <div className="prose prose-invert prose-xs max-w-none [&>p]:mb-1 [&_table]:text-[11px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap text-sm">{msg.content}</span>
                )}
                <div className={`text-[9px] mt-1 ${msg.role === 'user' ? 'text-blue-300/40' : 'text-gray-600'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {/* Live streaming */}
          {isLoading && liveEvents.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
              {liveEvents.slice(-5).map((event, i) => (
                <EventCard key={i} event={event} />
              ))}
            </div>
          )}

          {isLoading && liveEvents.length === 0 && (
            <div className="flex items-center gap-2 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span className="text-xs text-gray-500">Thinking...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={context?.entityName ? `Ask about ${context.entityName}...` : 'Ask anything...'}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            {isLoading ? (
              <button onClick={stopGeneration} className="p-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30">
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()} className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg">
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[9px] text-gray-600 mt-1 text-center">Cmd+K to toggle &middot; Esc to close</p>
        </div>
      </div>
    </>
  );
}
