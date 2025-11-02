import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types/chat';

interface ChatMessageListProps {
  messages: ChatMessage[];
}

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={containerRef} className="chat-scroll-region">
      {messages.map((message) => (
        <article key={message.id} className={`chat-message chat-message-${message.role}`}>
          <header className="chat-message-meta">
            <span className="chat-role">{message.role === 'user' ? 'You' : 'Assistant'}</span>
            <span className="chat-timestamp">{new Date(message.createdAt).toLocaleTimeString()}</span>
          </header>
          <p className="chat-content">{message.content}</p>
        </article>
      ))}
    </div>
  );
}
