import { useEffect, useRef } from 'react';
import type { ChatMessage, ToolCall } from '../types/chat';
import { cn } from '../lib/utils';

interface ChatMessageListProps {
  messages: ChatMessage[];
  userInitials?: string;
}

export function ChatMessageList({ messages, userInitials = 'You' }: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={containerRef} className="space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} userInitials={userInitials} />
      ))}
    </div>
  );
}

function MessageBubble({ message, userInitials }: { message: ChatMessage; userInitials: string }) {
  const isUser = message.role === 'user';
  const avatar = isUser ? userInitials : 'AI';

  return (
    <article className={cn('flex gap-3', isUser ? 'flex-row-reverse text-right' : 'flex-row')}>
      <div
        aria-hidden
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-secondary-foreground',
          isUser && 'bg-primary text-primary-foreground'
        )}
      >
        {avatar}
      </div>
      <div
        className={cn(
          'flex max-w-3xl flex-col gap-2 rounded-2xl border px-4 py-3 shadow-sm',
          isUser
            ? 'ml-auto bg-primary text-primary-foreground border-primary/40'
            : 'bg-card text-card-foreground'
        )}
      >
        <header className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>{isUser ? 'You' : 'NexusNote'}</span>
          <span aria-hidden>•</span>
          <time dateTime={message.createdAt}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </header>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
        {message.toolCalls?.length ? <ToolCallList toolCalls={message.toolCalls} /> : null}
      </div>
    </article>
  );
}

function ToolCallList({ toolCalls }: { toolCalls: ToolCall[] }) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-background/80 p-3 text-xs text-muted-foreground">
      <p className="font-semibold text-muted-foreground">Tool output</p>
      {toolCalls.map((call, index) => (
        <div key={index} className="space-y-2 rounded-lg bg-muted/60 p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {call.toolName}
          </div>
          <pre className="max-h-40 overflow-auto rounded-md bg-background px-2 py-1 text-[11px]">
            {JSON.stringify(call.arguments, null, 2)}
          </pre>
          {call.output.length ? (
            <div className="space-y-1">
              {call.output.map((text, idx) => (
                <pre key={idx} className="rounded-md bg-background px-2 py-1 text-[11px]">
                  {text}
                </pre>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
