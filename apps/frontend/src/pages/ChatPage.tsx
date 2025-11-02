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
    <div className="chat-shell">
      <header className="chat-header">
        <div>
          <h1>NexusNote Assistant</h1>
          <p className="chat-subtitle">Connected to DynamoDB, S3, and RDS via MCP tools.</p>
        </div>
        <div className="chat-user-panel">
          <div className="chat-user-chip">
            <span className="chat-avatar" aria-hidden>
              {initials}
            </span>
            <div className="chat-user-info">
              <span className="chat-user-name">{user?.displayName}</span>
              <span className="chat-user-email">{user?.email}</span>
            </div>
          </div>
          <button className="chat-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="chat-main">
        <ChatMessageList messages={messages} />
      </main>

      <footer className="chat-footer">
        {error && <div className="chat-error-banner">{error}</div>}
        <div className="chat-controls">
          <button className="chat-reset" type="button" onClick={reset} disabled={pending}>
            Clear conversation
          </button>
        </div>
        <ChatComposer disabled={pending} onSend={(value) => sendMessage({ content: value })} />
      </footer>
    </div>
  );
}
