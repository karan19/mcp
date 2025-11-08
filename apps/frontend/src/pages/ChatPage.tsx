import type { FormEvent, ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChatSession } from '../hooks/useChat';

type IconProps = {
  className?: string;
};

function PanelLeftIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M8 3v14" />
      <path d="M11 10l3 3" />
      <path d="M11 10l3-3" />
    </svg>
  );
}

function PenSquareIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <rect x="3.25" y="3.25" width="9.5" height="13.5" rx="1.5" />
      <path d="M8 12.5l6.5-6.5 2 2-6.5 6.5-3 1zm5.5-7.5l1.5 1.5" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <circle cx="9" cy="9" r="4.5" />
      <path d="M13 13l4 4" />
    </svg>
  );
}

function AudioBarsIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <path d="M4 12.5v-3M8 15.5v-9M12 13.5v-5M16 11.5v-1" />
    </svg>
  );
}

function CircleIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="6.5" />
    </svg>
  );
}

function SunIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2.5M10 15.5V18M4.22 4.22L5.97 5.97M14.03 14.03L15.78 15.78M2 10h2.5M15.5 10H18M4.22 15.78L5.97 14.03M14.03 5.97L15.78 4.22" />
    </svg>
  );
}

function MoonIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M16 12.5A6.5 6.5 0 019.5 6a6.48 6.48 0 01.9-3.3A6.5 6.5 0 1016 12.5z" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden focusable="false">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function MicIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M10 3a2.5 2.5 0 00-2.5 2.5v3A2.5 2.5 0 0010 11a2.5 2.5 0 002.5-2.5v-3A2.5 2.5 0 0010 3z" />
      <path d="M5.75 9.5v1A4.25 4.25 0 0010 14.75 4.25 4.25 0 0014.25 10.5v-1" />
      <path d="M10 14.75V17" />
      <path d="M7.5 17h5" />
    </svg>
  );
}

function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M4 6h12" />
      <path d="M9 9v6" />
      <path d="M11 9v6" />
      <path d="M6 6l1 9a1 1 0 00.99.9h4.02a1 1 0 00.99-.9l1-9" />
      <path d="M7 6V4h6v2" />
    </svg>
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    messages,
    pending,
    error,
    historyError,
    conversations,
    loadingConversations,
    loadingHistory,
    sessionId,
    sendMessage,
    startNewConversation,
    selectConversation,
    refreshConversations,
    deleteConversation,
  } = useChatSession();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }
    const stored = window.localStorage.getItem('modern-theme');
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setSidebarOpen(window.innerWidth >= 960);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('modern-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [userMenuOpen]);

  const alerts = useMemo(() => {
    const list: string[] = [];
    if (historyError) {
      list.push(historyError);
    }
    if (error) {
      list.push(error);
    }
    return list;
  }, [error, historyError]);

  const activeConversationId = sessionId ?? null;
  const hasMessages = messages.length > 0;
  const profileName = user?.displayName ?? user?.email ?? 'Your account';
  const initials = user?.displayName?.slice(0, 2).toUpperCase() ?? user?.email?.slice(0, 2).toUpperCase() ?? 'UU';

  const handleConversationSelect = (targetSessionId: string) => {
    void selectConversation(targetSessionId);
    if (typeof window !== 'undefined' && window.innerWidth < 960) {
      setSidebarOpen(false);
    }
  };

  const handleConversationDelete = (targetSessionId: string) => {
    const confirmed = window.confirm('Delete this conversation? This action cannot be undone.');
    if (!confirmed) {
      return;
    }
    void deleteConversation(targetSessionId);
  };

  const handleNewConversation = () => {
    startNewConversation();
    setInputValue('');
    if (typeof window !== 'undefined' && window.innerWidth < 960) {
      setSidebarOpen(false);
    }
  };

  const handleRefreshConversations = () => {
    refreshConversations().catch(() => {
      /* handled in state */
    });
  };

  const handleThemeToggle = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const handleSignOut = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/', { replace: true });
  };

  const handleSendMessage = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || pending) {
      return;
    }
    setInputValue('');
    await sendMessage({ content: trimmed });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSendMessage();
  };

  const navItems: Array<{ key: string; label: string; icon: (props: IconProps) => ReactElement; onClick?: () => void }> = [
    { key: 'new', label: 'New chat', icon: PenSquareIcon, onClick: handleNewConversation },
    { key: 'search', label: 'Search chats', icon: SearchIcon, onClick: handleRefreshConversations },
  ];

  return (
    <div className="modern-chat" data-theme={theme}>
      <aside className={`modern-chat__sidebar${sidebarOpen ? ' is-open' : ''}`}>
        {!sidebarOpen ? (
          <div className="modern-sidebar__collapsed">
            <button
              type="button"
              className="modern-sidebar__brand modern-sidebar__brand--toggle modern-sidebar__brand--collapsed"
              onClick={() => setSidebarOpen(true)}
              aria-label="Expand sidebar"
            >
              <CircleIcon className="modern-icon modern-sidebar__brand-icon" />
              <PanelLeftIcon className="modern-icon modern-sidebar__brand-hover-icon" />
            </button>
            <div className="modern-sidebar__collapsed-nav">
              {navItems.map(({ key, label, icon: Icon, onClick }) => (
                <button
                  key={key}
                  type="button"
                  className="modern-icon-button modern-icon-button--muted"
                  aria-label={label}
                  onClick={onClick}
                >
                  <Icon className="modern-icon" />
                </button>
              ))}
            </div>
            <button type="button" className="modern-icon-button modern-icon-button--muted modern-sidebar__collapsed-profile" aria-label={profileName} title={profileName}>
              <span className="modern-sidebar__collapsed-profile-text" aria-hidden>
                {initials}
              </span>
            </button>
          </div>
        ) : null}
        <div className="modern-chat__sidebar-inner" aria-hidden={!sidebarOpen}>
          <div className="modern-sidebar__header">
            <div className="modern-sidebar__brand modern-sidebar__brand--static">
              <CircleIcon className="modern-icon" />
            </div>
            <button type="button" className="modern-icon-button" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar">
              <PanelLeftIcon className="modern-icon" />
            </button>
          </div>

          <nav className="modern-sidebar__nav">
            {navItems.map(({ key, label, icon: Icon, onClick }) => (
              <button key={key} type="button" className="modern-sidebar__nav-button" onClick={onClick}>
                <Icon className="modern-icon" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="modern-sidebar__divider" />

          <div className="modern-sidebar__list">
            {loadingConversations ? <p className="modern-sidebar__hint">Loading conversations…</p> : null}
            {!loadingConversations && conversations.length === 0 ? <p className="modern-sidebar__hint">No conversations yet.</p> : null}
            {conversations.map((conversation) => (
              <div
                key={conversation.sessionId}
                className={`modern-sidebar__conversation${conversation.sessionId === activeConversationId ? ' is-active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => handleConversationSelect(conversation.sessionId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleConversationSelect(conversation.sessionId);
                  }
                }}
              >
                <button
                  type="button"
                  className="modern-sidebar__conversation-trigger"
                  onClick={() => handleConversationSelect(conversation.sessionId)}
                >
                  <span className="modern-sidebar__conversation-title">{conversation.title?.trim() || 'Untitled conversation'}</span>
                  <span className="modern-sidebar__conversation-meta">
                    {formatTimestamp(conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="modern-sidebar__conversation-delete"
                  aria-label="Delete conversation"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleConversationDelete(conversation.sessionId);
                  }}
                >
                  <TrashIcon className="modern-icon" />
                </button>
              </div>
            ))}
          </div>

          <div className="modern-sidebar__profile">{profileName}</div>
        </div>
      </aside>

      <main className="modern-chat__main">
        <header className="modern-main__header">
          <div className="modern-main__left">
          </div>
          <div className="modern-main__actions">
            <button
              type="button"
              className="modern-icon-button modern-theme-toggle"
              onClick={handleThemeToggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <SunIcon className="modern-icon" /> : <MoonIcon className="modern-icon" />}
            </button>
            <div className="modern-main__user" ref={menuRef}>
              <button
                type="button"
                className="modern-main__user-button"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="User menu"
              >
                <span className="modern-main__user-initials" aria-hidden>
                  {initials}
                </span>
              </button>
              {userMenuOpen ? (
                <div className="modern-main__user-dropdown" role="menu">
                  {user?.email ? <div className="modern-main__user-email">{user.email}</div> : null}
                  <button type="button" className="modern-main__user-signout" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="modern-main__body">
          {loadingHistory ? <div className="modern-main__status">Loading conversation…</div> : null}
          {alerts.length > 0 ? (
            <div className="modern-main__alerts">
              {alerts.map((message, index) => (
                <div key={index} className="modern-main__alert">
                  {message}
                </div>
              ))}
            </div>
          ) : null}

          {hasMessages ? (
            <div className="modern-messages">
              {messages.map((message) => (
                <div key={message.id} className={`modern-message modern-message--${message.role}`}>
                  {message.role === 'user' ? (
                    <div className="modern-message__bubble modern-message__bubble--user">{message.content}</div>
                  ) : (
                    <div className="modern-message__bubble modern-message__bubble--assistant">{message.content}</div>
                  )}
                </div>
              ))}
              {pending ? <div className="modern-main__status modern-main__status--pending">Waiting for assistant…</div> : null}
            </div>
          ) : (
            <div className="modern-empty">
              <div className="modern-empty__content">
                <h1 className="modern-empty__title">What&apos;s on your mind today?</h1>
              </div>
            </div>
          )}
        </section>

        <div className={`modern-main__composer${hasMessages ? '' : ' modern-main__composer--centered'}`}>
          <form className={`modern-composer${hasMessages ? '' : ' modern-composer--centered'}`} onSubmit={handleSubmit}>
            <button type="button" className="modern-icon-button modern-icon-button--muted" aria-label="Attach">
              <PlusIcon className="modern-icon" />
            </button>
            <input
              type="text"
              className="modern-composer__input"
              placeholder="Ask anything"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendMessage();
                }
              }}
              disabled={pending}
            />
            <div className="modern-composer__actions">
              <button type="button" className="modern-icon-button modern-icon-button--muted" aria-label="Speak prompt">
                <MicIcon className="modern-icon" />
              </button>
              <button type="button" className="modern-icon-button modern-icon-button--muted" aria-label="Audio pulse">
                <AudioBarsIcon className="modern-icon" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function formatTimestamp(value: string | undefined) {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
