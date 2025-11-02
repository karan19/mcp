import { useEffect, useRef } from 'react';
import type { ChatMessage, ToolCall } from '../types/chat';

interface ChatMessageListProps {
  messages: ChatMessage[];
  userInitials?: string;
}

export function ChatMessageList({ messages, userInitials = 'You' }: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={containerRef} className="chat-thread-scroller">
      <div className="chat-thread">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const avatarContent = isUser ? userInitials : 'AI';

          return (
            <article key={message.id} className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--assistant'}`}>
              <div className="chat-bubble__avatar" aria-hidden>
                {avatarContent}
              </div>
              <div className="chat-bubble__body">
                <header className="chat-bubble__meta">
                  <span className="chat-bubble__author">{isUser ? 'You' : 'Chat MCP'}</span>
                  <time className="chat-bubble__timestamp" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </header>
                <div className="chat-bubble__content">{message.content}</div>
                {message.toolCalls?.length ? <ToolCallList toolCalls={message.toolCalls} /> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ToolCallList({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <div className="chat-bubble__tool-call">
      <p className="chat-bubble__tool-heading">Tool output</p>
      {toolCalls.map((call, index) => (
        <div key={index} className="chat-bubble__tool-item">
          <div className="chat-bubble__tool-header">
            <span className="chat-bubble__tool-chip">Tool</span>
            <span className="chat-bubble__tool-name">{call.toolName}</span>
          </div>
          <pre className="chat-bubble__tool-args">{JSON.stringify(call.arguments, null, 2)}</pre>
          <div className="chat-bubble__tool-output">
            {call.output.map((text, idx) => (
              <pre key={idx} className="chat-bubble__tool-text">
                {text}
              </pre>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
