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
    <div ref={containerRef} className="chatgpt-conversation-wrapper">
      <div className="chatgpt-conversation">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const avatarContent = isUser ? userInitials : 'AI';

          return (
            <article key={message.id} className={`chatgpt-message chatgpt-message-${message.role}`}>
              <div className="chatgpt-message-avatar" aria-hidden>
                {avatarContent}
              </div>
              <div className="chatgpt-message-body">
                <header className="chatgpt-message-meta">
                  <span className="chatgpt-author">{isUser ? 'You' : 'NexusNote'}</span>
                  <time className="chatgpt-timestamp" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </header>
                <p className="chatgpt-message-content">{message.content}</p>
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
    <div className="chatgpt-tool-call">
      <p className="chatgpt-tool-heading">Tool output</p>
      {toolCalls.map((call, index) => (
        <div key={index} className="chatgpt-tool-item">
          <div className="chatgpt-tool-header">
            <span className="chatgpt-tool-chip">Tool</span>
            <span className="chatgpt-tool-name">{call.toolName}</span>
          </div>
          <p className="chatgpt-tool-args">{JSON.stringify(call.arguments, null, 2)}</p>
          <div className="chatgpt-tool-output">
            {call.output.map((text, idx) => (
              <pre key={idx} className="chatgpt-tool-text">
                {text}
              </pre>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
