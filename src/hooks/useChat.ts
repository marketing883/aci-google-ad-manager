'use client';

import { useState, useRef, useCallback } from 'react';
import type { ChatContext } from '@/types/intelligence';

// ============================================================
// Shared Chat Hook
// Used by both the full chat page AND the slide-out ChatPanel.
// Handles SSE streaming, message management, and history.
// ============================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  events?: HarnessEvent[];
  timestamp: Date;
}

export interface HarnessEvent {
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

interface UseChatOptions {
  context?: ChatContext;
}

export function useChat(options?: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveEvents, setLiveEvents] = useState<HarnessEvent[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<HarnessEvent | null>(null);
  const [pipelineContext, setPipelineContext] = useState<unknown>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
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
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await fetch('/api/chat/history', { method: 'DELETE' });
      setMessages([]);
      setLiveEvents([]);
      setPendingQuestion(null);
      setPipelineContext(null);
    } catch { /* ignore */ }
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (messageText: string) => {
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
    setIsLoading(true);
    setLiveEvents([]);

    // Create abort controller for cancellation
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build request body with optional page context
      const body: Record<string, unknown> = {
        message: messageText,
        pipelineContext,
      };

      // Include page context if provided
      if (options?.context) {
        body.pageContext = options.context.summary
          || `User is on the ${options.context.page} page${options.context.entityName ? `, looking at "${options.context.entityName}"` : ''}${options.context.entityId ? ` (id: ${options.context.entityId})` : ''}`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
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
            // Skip unparseable events
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
      if ((error as Error).name === 'AbortError') {
        // User cancelled — add a note
        setMessages((prev) => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Stopped.',
          timestamp: new Date(),
        }]);
      } else {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    }

    abortControllerRef.current = null;
    setIsLoading(false);
  }, [isLoading, pipelineContext, options?.context]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    liveEvents,
    pendingQuestion,
    sendMessage,
    loadHistory,
    clearHistory,
    stopGeneration,
    setPendingQuestion,
  };
}
