'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ChatContext } from '@/types/intelligence';

interface ChatPanelState {
  isOpen: boolean;
  context: ChatContext | undefined;
  initialMessage: string | undefined;
  openChat: (context?: ChatContext, initialMessage?: string) => void;
  closeChat: () => void;
}

const ChatPanelCtx = createContext<ChatPanelState>({
  isOpen: false,
  context: undefined,
  initialMessage: undefined,
  openChat: () => {},
  closeChat: () => {},
});

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<ChatContext | undefined>();
  const [initialMessage, setInitialMessage] = useState<string | undefined>();

  const openChat = useCallback((ctx?: ChatContext, msg?: string) => {
    setContext(ctx);
    setInitialMessage(msg);
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    // Don't clear context/message — panel might reopen
  }, []);

  // Escape to close the chat panel.
  // Cmd+K is now owned by the CommandPalette; the palette has an action that
  // opens this panel if the user wants to jump straight into chat.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        closeChat();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeChat]);

  return (
    <ChatPanelCtx.Provider value={{ isOpen, context, initialMessage, openChat, closeChat }}>
      {children}
    </ChatPanelCtx.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelCtx);
}
