'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Sparkles, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  'Research keywords for cloud consulting services targeting enterprises',
  'Build a search campaign for our DevOps services with $50/day budget',
  'Analyze my campaign performance and suggest optimizations',
  'Generate new ad copy variations for my best performing ad group',
];

// Session storage keys for state persistence
const STATE_KEY = 'aci_chat_state';
const PLAN_KEY = 'aci_chat_plan';
const INTENT_KEY = 'aci_chat_intent';

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist orchestrator state across page navigations (not refreshes)
  const [chatState, setChatState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(STATE_KEY) || 'idle';
    }
    return 'idle';
  });
  const [currentPlan, setCurrentPlan] = useState<unknown>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(PLAN_KEY);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });
  const [currentIntent, setCurrentIntent] = useState<unknown>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(INTENT_KEY);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });

  // Persist state changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(STATE_KEY, chatState);
  }, [chatState]);
  useEffect(() => {
    sessionStorage.setItem(PLAN_KEY, currentPlan ? JSON.stringify(currentPlan) : '');
  }, [currentPlan]);
  useEffect(() => {
    sessionStorage.setItem(INTENT_KEY, currentIntent ? JSON.stringify(currentIntent) : '');
  }, [currentIntent]);

  // Load chat history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

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
      setChatState('idle');
      setCurrentPlan(null);
      setCurrentIntent(null);
    } catch { /* ignore */ }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageText = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          state: chatState,
          plan: currentPlan,
          intent: currentIntent,
        }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setChatState(data.state || 'idle');
      setCurrentPlan(data.plan || null);
      setCurrentIntent(data.intent || null);
    } catch (error) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Something went wrong. Check that your AI keys are configured in .env.local'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      // Reset state on error to prevent getting stuck
      setChatState('idle');
      setCurrentPlan(null);
      setCurrentIntent(null);
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-7 h-7 text-blue-400" />
          <h1 className="text-2xl font-bold">AI Campaign Assistant</h1>
          {chatState !== 'idle' && (
            <span className="text-xs px-2 py-0.5 bg-purple-600/20 text-purple-400 rounded">
              {chatState.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button onClick={clearHistory} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-12 h-12 text-purple-400 mb-4" />
            <h2 className="text-xl font-semibold mb-2">What would you like to do?</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-md">
              Tell me what you need and I will research, build, and optimize your Google Ads campaigns.
              Everything goes through your approval before going live.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:border-gray-700 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-2xl px-4 py-3 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-900 border border-gray-800 text-gray-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-invert prose-sm max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h2]:text-base [&>h3]:text-sm [&>ol>li]:mb-1">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
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
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Tell me what you want to do with your Google Ads... (Shift+Enter for new line)"
            rows={1}
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none overflow-hidden"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <button
            onClick={handleSend}
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
