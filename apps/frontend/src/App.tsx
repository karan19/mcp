import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import './index.css';

type MessageRole = 'user' | 'assistant';

type Message = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

type ConversationSummary = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
};

const DEFAULT_TITLE = 'New chat';
const DEFAULT_DESCRIPTION = 'Ask anything to get started.';

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const formatTimestamp = () =>
  new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

const buildWelcomeMessage = (): Message => ({
  id: createId('assistant'),
  role: 'assistant',
  content: "Hello! I'm your AI assistant. Ask a question, describe a task, or paste content you'd like help with.",
  createdAt: formatTimestamp(),
});

const seededConversations: ConversationSummary[] = [
  {
    id: 'conv-home',
    title: 'Catch me up on the launch',
    description: 'Summarize the release notes for a quick team update.',
    updatedAt: 'Today',
  },
  {
    id: 'conv-ideas',
    title: 'Brainstorm campaign ideas',
    description: 'Write playful taglines for a spring announcement.',
    updatedAt: 'Yesterday',
  },
  {
    id: 'conv-sql',
    title: 'SQL troubleshooting',
    description: 'Filter customer sign-ups by geography and tier.',
    updatedAt: '2 days ago',
  },
];

const seededMessages: Record<string, Message[]> = {
  'conv-home': [
    {
      id: 'assistant-home-1',
      role: 'assistant',
      content:
        "Hi! I'm your ChatGPT-style copilot. Let me know what you're working on and I can help with drafting, summarising, or brainstorming.",
      createdAt: formatTimestamp(),
    },
    {
      id: 'user-home-1',
      role: 'user',
      content: 'Could you recap the highlights from the v2.5 launch announcement?',
      createdAt: formatTimestamp(),
    },
    {
      id: 'assistant-home-2',
      role: 'assistant',
      content:
        'Absolutely! Here is a placeholder response. Wire this UI up to your backend chat endpoint to stream a live answer for the team.',
      createdAt: formatTimestamp(),
    },
  ],
  'conv-ideas': [
    {
      id: 'user-ideas-1',
      role: 'user',
      content: 'I need three bold taglines for a playful product reveal.',
      createdAt: formatTimestamp(),
    },
    {
      id: 'assistant-ideas-1',
      role: 'assistant',
      content: 'Fun idea! Try connecting this conversation to generate on-brand copy instantly.',
      createdAt: formatTimestamp(),
    },
  ],
  'conv-sql': [
    {
      id: 'assistant-sql-1',
      role: 'assistant',
      content:
        'Ready when you are. Drop in the metrics you care about and I will help write the SQL once the backend is connected.',
      createdAt: formatTimestamp(),
    },
  ],
};

const INITIAL_CONVERSATION_ID = seededConversations[0].id;

function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>(seededConversations);
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>(seededMessages);
  const [activeConversation, setActiveConversation] = useState<string>(INITIAL_CONVERSATION_ID);
  const [draft, setDraft] = useState('');

  const activeMessages = messageMap[activeConversation] ?? [];

  const sendMessage = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    const timestamp = formatTimestamp();
    const userMessage: Message = {
      id: createId('user'),
      role: 'user',
      content: trimmed,
      createdAt: timestamp,
    };

    const assistantMessage: Message = {
      id: createId('assistant'),
      role: 'assistant',
      content: 'This is a placeholder reply. Connect the UI to your chat service to stream a real response.',
      createdAt: formatTimestamp(),
    };

    const currentMessages = messageMap[activeConversation] ?? [];
    const isFirstUserMessage = currentMessages.every((message) => message.role !== 'user');

    setMessageMap((previous) => ({
      ...previous,
      [activeConversation]: [...currentMessages, userMessage, assistantMessage],
    }));

    setConversations((previous) =>
      previous.map((conversation) => {
        if (conversation.id !== activeConversation) {
          return conversation;
        }

        const snippet = trimmed.length > 56 ? `${trimmed.slice(0, 56)}…` : trimmed;
        const headline = trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;

        return {
          ...conversation,
          title: isFirstUserMessage ? headline || conversation.title : conversation.title,
          description: snippet || DEFAULT_DESCRIPTION,
          updatedAt: 'Just now',
        };
      }),
    );

    setDraft('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversation(conversationId);
    setDraft('');

    setMessageMap((previous) => {
      if (previous[conversationId]) {
        return previous;
      }

      return {
        ...previous,
        [conversationId]: [buildWelcomeMessage()],
      };
    });
  };

  const handleNewChat = () => {
    const newConversationId = createId('conv');
    const welcomeMessage = buildWelcomeMessage();

    const newConversation: ConversationSummary = {
      id: newConversationId,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      updatedAt: 'Just now',
    };

    setConversations((previous) => [newConversation, ...previous]);
    setMessageMap((previous) => ({
      ...previous,
      [newConversationId]: [welcomeMessage],
    }));

    setActiveConversation(newConversationId);
    setDraft('');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Chat conversation list">
        <div className="sidebar-header">
          <button className="new-chat-button" type="button" onClick={handleNewChat}>
            <span aria-hidden="true">＋</span>
            <span>New chat</span>
          </button>
        </div>

        <nav className="conversation-list" aria-label="Recent conversations">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`conversation-item ${conversation.id === activeConversation ? 'is-active' : ''}`}
              onClick={() => handleSelectConversation(conversation.id)}
            >
              <span className="conversation-title">{conversation.title}</span>
              <span className="conversation-description">{conversation.description}</span>
              <span className="conversation-updated">{conversation.updatedAt}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-pill">
            <span className="profile-avatar" aria-hidden="true">
              <span>AC</span>
            </span>
            <div className="profile-meta">
              <span className="profile-name">Acme Workspace</span>
              <span className="profile-status">Online</span>
            </div>
          </div>
          <button className="sidebar-icon-button" type="button" aria-label="Open settings">
            ⋯
          </button>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div className="chat-heading">
            <h1>{conversations.find((conversation) => conversation.id === activeConversation)?.title ?? 'Chat'}</h1>
            <p>GPT-4o mini · Fast, creative responses</p>
          </div>
          <div className="chat-actions">
            <button className="chat-action-button" type="button">
              <span aria-hidden="true">?</span>
              <span className="sr-only">Help</span>
            </button>
            <button className="chat-action-button" type="button">
              <span aria-hidden="true">☀︎</span>
              <span className="sr-only">Toggle theme</span>
            </button>
          </div>
        </header>

        <section className="message-list" aria-live="polite">
          {activeMessages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <div className="message-avatar" aria-hidden="true">
                {message.role === 'assistant' ? 'AI' : 'You'}
              </div>
              <div className="message-bubble">
                <div className="message-meta">
                  <span className="message-role">{message.role === 'assistant' ? 'ChatGPT' : 'You'}</span>
                  <span className="message-dot" aria-hidden="true" />
                  <span className="message-time">{message.createdAt}</span>
                </div>
                <p>{message.content}</p>
              </div>
            </article>
          ))}

          <div className="message-hint" aria-hidden="true">
            Conversations are kept locally. Connect to your chat backend to load history.
          </div>
        </section>

        <footer className="composer">
          <form className="composer-form" onSubmit={handleSubmit}>
            <div className="composer-field">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message ChatGPT"
                rows={1}
                aria-label="Message input"
              />
              <div className="composer-toolbar">
                <span className="composer-hint">Shift + Enter to add a new line</span>
                <button type="submit" className="send-button" disabled={!draft.trim()}>
                  Send
                </button>
              </div>
            </div>
          </form>
        </footer>
      </main>
    </div>
  );
}

export default App;
