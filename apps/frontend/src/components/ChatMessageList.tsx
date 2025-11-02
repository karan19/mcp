import { useEffect, useRef } from 'react';
import type { ChatMessage, ToolCall } from '../types/chat';

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
          {message.toolCalls?.length ? <ToolCallList toolCalls={message.toolCalls} /> : null}
        </article>
      ))}
    </div>
  );
}

function ToolCallList({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <div className="tool-call-list">
      <p className="tool-call-heading">Tool output</p>
      {toolCalls.map((call, index) => (
        <div key={index} className="tool-call-item">
          <div className="tool-call-title">
            <span className="tool-call-chip">Tool</span>
            <span className="tool-call-name">{call.toolName}</span>
            <span className="tool-call-args">{JSON.stringify(call.arguments, null, 2)}</span>
          </div>
          <div className="tool-call-output">
            {call.output.map((text, idx) => (
              <pre key={idx} className="tool-call-text">
                {text}
              </pre>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
