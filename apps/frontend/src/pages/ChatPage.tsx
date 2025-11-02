import { useNavigate } from 'react-router-dom';
import { ChatComposer } from '../components/ChatComposer';
import { ChatMessageList } from '../components/ChatMessageList';
import { useAuth } from '../context/AuthContext';
import { useChatSession } from '../hooks/useChat';

export function ChatPage() {
  const { user, logout } = useAuth();
  const { messages, sendMessage, pending, reset, error } = useChatSession();
  const navigate = useNavigate();
  const initials = user?.displayName?.charAt(0).toUpperCase() ?? 'U';

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="chatgpt-shell">
      <header className="chatgpt-topbar">
        <div className="chatgpt-brand">
          <span className="chatgpt-logo" aria-hidden>
            NN
          </span>
          <div className="chatgpt-brand-text">
            <h1 className="chatgpt-title">NexusNote Assistant</h1>
            <p className="chatgpt-subtitle">Connected to DynamoDB, S3, and RDS via MCP tools.</p>
          </div>
        </div>
        <div className="chatgpt-header-actions">
          <button className="chatgpt-reset" type="button" onClick={reset} disabled={pending}>
            New chat
          </button>
          <div className="chatgpt-user">
            <span className="chatgpt-user-avatar" aria-hidden>
              {initials}
            </span>
            <div className="chatgpt-user-details">
              <span className="chatgpt-user-name">{user?.displayName}</span>
              <span className="chatgpt-user-email">{user?.email}</span>
            </div>
          </div>
          <button className="chatgpt-signout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="chatgpt-main">
        <ChatMessageList messages={messages} userInitials={initials} />
      </main>

      <footer className="chatgpt-footer">
        {error && <div className="chatgpt-error">{error}</div>}
        <ChatComposer disabled={pending} onSend={(value) => sendMessage({ content: value })} />
        <p className="chatgpt-disclaimer">NexusNote may produce inaccurate information about your data. Please verify important responses.</p>
      </footer>
    </div>
  );
}
