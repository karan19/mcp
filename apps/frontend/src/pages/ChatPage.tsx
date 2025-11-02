import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatComposer } from '../components/ChatComposer';
import { ChatIntro } from '../components/ChatIntro';
import { ChatMessageList } from '../components/ChatMessageList';
import { useAuth } from '../context/AuthContext';
import { useChatSession } from '../hooks/useChat';

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
  } = useChatSession();

  const initials = user?.displayName?.charAt(0).toUpperCase() ?? 'U';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }
    const stored = window.localStorage.getItem('chat-theme');
    return stored === 'dark' ? 'dark' : 'light';
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('chat-theme', theme);
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

  const introMode = messages.length === 0;
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

  const handleConversationSelect = (targetSessionId: string) => {
    void selectConversation(targetSessionId);
    setSidebarOpen(false);
  };

  const handleThemeToggle = () => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  };

  const handleSignOut = () => {
    setUserMenuOpen(false);
    logout();
    navigate('/', { replace: true });
  };

  const menuLabel = sidebarOpen ? 'Close conversation list' : 'Open conversation list';
  const activeConversationId = sessionId ?? null;

  return (
    <div className="chat-app" data-theme={theme}>
      <aside className={`chat-sidebar${sidebarOpen ? ' chat-sidebar--open' : ''}`}>
        <div className="chat-sidebar__header">
          <h2 className="chat-sidebar__title">Conversations</h2>
          <button
            type="button"
            className="chat-sidebar__refresh"
            onClick={() => {
              void refreshConversations();
            }}
            disabled={loadingConversations}
          >
            Refresh
          </button>
        </div>
        <button
          type="button"
          className="chat-sidebar__new"
          onClick={() => {
            startNewConversation();
            setSidebarOpen(false);
          }}
        >
          New chat
        </button>
        <div className="chat-sidebar__scroller">
          {loadingConversations ? (
            <p className="chat-sidebar__status">Loading conversations…</p>
          ) : null}
          {!loadingConversations && conversations.length === 0 ? (
            <p className="chat-sidebar__status">No conversations yet.</p>
          ) : null}
          {conversations.map((conversation) => (
            <button
              type="button"
              key={conversation.sessionId}
              className={`chat-sidebar__item${conversation.sessionId === activeConversationId ? ' chat-sidebar__item--active' : ''}`}
              onClick={() => handleConversationSelect(conversation.sessionId)}
            >
              <span className="chat-sidebar__item-title">
                {conversation.title?.trim() || 'Untitled conversation'}
              </span>
              <span className="chat-sidebar__item-meta">
                {formatTimestamp(conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt)}
              </span>
              {conversation.lastMessagePreview ? (
                <span className="chat-sidebar__item-preview">{conversation.lastMessagePreview}</span>
              ) : null}
            </button>
          ))}
        </div>
      </aside>
      <div
        className={`chat-sidebar-overlay${sidebarOpen ? ' chat-sidebar-overlay--visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header__left">
            <button
              type="button"
              className="chat-icon-button"
              onClick={() => setSidebarOpen(true)}
              aria-label={menuLabel}
            >
              <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden focusable="false">
                <path d="M0 1h20M0 6h20M0 11h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <div className="chat-brand">
              <span className="chat-brand__logo" aria-hidden>
                CM
              </span>
              <div className="chat-brand__text">
                <h1 className="chat-brand__name">Chat MCP</h1>
                <p className="chat-brand__tagline">Conversational command center</p>
              </div>
            </div>
          </div>
          <div className="chat-header__right">
            <button
              type="button"
              className={`chat-theme-toggle${theme === 'dark' ? ' chat-theme-toggle--dark' : ''}`}
              onClick={handleThemeToggle}
              aria-pressed={theme === 'dark'}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <svg className="chat-theme-toggle__icon chat-theme-toggle__icon--sun" viewBox="0 0 24 24" aria-hidden focusable="false">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
              </svg>
              <svg className="chat-theme-toggle__icon chat-theme-toggle__icon--moon" viewBox="0 0 24 24" aria-hidden focusable="false">
                <path d="M21 15.27A8.5 8.5 0 0 1 9.73 3a6.5 6.5 0 1 0 11.27 12.27z" />
              </svg>
              <span className="chat-theme-toggle__thumb" />
            </button>
            <div className="chat-user-menu" ref={menuRef}>
              <button
                type="button"
                className="chat-user-button"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <span className="chat-user-button__avatar" aria-hidden>
                  {initials}
                </span>
              </button>
              {userMenuOpen ? (
                <div className="chat-user-dropdown" role="menu">
                  <div className="chat-user-dropdown__details">
                    <span className="chat-user-dropdown__name">{user?.displayName}</span>
                    <span className="chat-user-dropdown__email">{user?.email}</span>
                  </div>
                  <button type="button" className="chat-user-dropdown__item" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className={`chat-shell${introMode ? ' chat-shell--intro' : ''}`}>
          <div className="chat-body">
            {introMode ? <ChatIntro /> : <ChatMessageList messages={messages} userInitials={initials} />}
            {loadingHistory ? <div className="chat-loading">Loading conversation…</div> : null}
          </div>
          {alerts.length > 0 ? (
            <div className="chat-alerts">
              {alerts.map((message, index) => (
                <div key={index} className="chat-alert">
                  {message}
                </div>
              ))}
            </div>
          ) : null}
          <footer className="chat-footer">
            <ChatComposer disabled={pending} floating={introMode} onSend={(value) => sendMessage({ content: value })} />
          </footer>
        </div>
      </div>
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
