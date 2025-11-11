import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Moon,
  Sun,
  Plus,
  Search as SearchIcon,
  Trash2,
  LogOut,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChatSession } from '../hooks/useChat';
import type { ConversationSearchMatch } from '../types/chat';
import { ChatMessageList } from '../components/ChatMessageList';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { ScrollArea } from '../components/ui/scroll-area';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { cn } from '../lib/utils';

export function ChatPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    messages,
    pending,
    streamingActive,
    pendingStatus,
    error,
    historyError,
    conversations,
    loadingConversations,
    loadingHistory,
    sessionId,
    sendMessage,
    startNewConversation,
    selectConversation,
    deleteConversation,
    searchConversations,
    stopStreaming,
  } = useChatSession();

  const [inputValue, setInputValue] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }
    return (window.localStorage.getItem('nexus-theme') as 'light' | 'dark') ?? 'light';
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ConversationSearchMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem('nexus-sidebar-collapsed') === 'true';
  });

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    window.localStorage.setItem('nexus-theme', theme);
  }, [theme]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [sessionId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nexus-sidebar-collapsed', sidebarCollapsed ? 'true' : 'false');
    }
  }, [sidebarCollapsed]);

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || pending) {
      return;
    }
    await sendMessage({ content: trimmed });
    setInputValue('');
  };

  const handleSearch = async (query: string) => {
    const trimmed = query.trim();
    setSearchQuery(query);
    setSearchError(null);
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await searchConversations(trimmed);
      setSearchResults(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed.';
      setSearchError(message);
    } finally {
      setSearchLoading(false);
    }
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  };

  const activeConversationId = sessionId ?? null;
  const hasMessages = messages.length > 0;
  const initials = user?.displayName?.slice(0, 2).toUpperCase() ?? user?.email?.slice(0, 2).toUpperCase() ?? 'UU';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex h-screen">
        <ConversationSidebar
          conversations={conversations}
          loading={loadingConversations}
          activeConversationId={activeConversationId}
          onSelect={selectConversation}
          onDelete={setPendingDeleteId}
          onNewConversation={() => {
            startNewConversation();
            setInputValue('');
          }}
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onSearch={() => setSearchOpen(true)}
          navigate={navigate}
          closeSidebar={() => setSidebarOpen(false)}
        />

        <main className="flex flex-1 flex-col">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">
                      {initials}
                    </span>
                    <span className="hidden text-sm font-medium md:block">{user?.displayName ?? user?.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      logout();
                      navigate('/');
                    }}
                    className="flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <section className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden px-4 py-4">
              {alerts.length ? (
                <Card className="mb-4 border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
                  {alerts.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </Card>
              ) : null}
              <div className="h-full rounded-2xl border bg-card/60 p-4">
                {loadingHistory ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading conversation…
                  </div>
                ) : hasMessages ? (
                  <ScrollArea className="h-full pr-4">
                    <ChatMessageList messages={messages} userInitials={initials} />
                  </ScrollArea>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <p className="text-lg font-semibold text-foreground">Start a new conversation</p>
                <p className="mt-2 text-sm">Ask anything—tools, search, and context are only a prompt away.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t bg-card/80 px-4 py-3">
              <form onSubmit={handleSendMessage} className="space-y-2">
                <Textarea
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder="Send a message…"
                  rows={3}
                  disabled={pending}
                />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {pendingStatus ? (
                      <div className="flex items-center gap-2 text-primary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{pendingStatus}</span>
                        {streamingActive ? (
                          <Button variant="ghost" size="sm" onClick={stopStreaming}>
                            Stop
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <span></span>
                    )}
                  </div>
                  <Button type="submit" disabled={pending || !inputValue.trim()}>
                    {pending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>

      {searchOpen ? (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur">
          <Card className="fixed left-1/2 top-10 z-50 w-[min(640px,90vw)] -translate-x-1/2 border shadow-2xl">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(event) => handleSearch(event.target.value)}
              />
              <Button variant="ghost" onClick={() => setSearchOpen(false)}>
                Close
              </Button>
            </div>
            <ScrollArea className="max-h-[60vh] px-4 py-3">
              {searchLoading ? (
                <p className="text-sm text-muted-foreground">Searching…</p>
              ) : searchError ? (
                <p className="text-sm text-destructive">{searchError}</p>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matches yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {searchResults.map((match) => (
                    <li
                      key={match.messageId}
                      className="rounded-lg border bg-muted/40 p-3 transition hover:bg-muted"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setSearchOpen(false);
                          setSidebarOpen(false);
                          selectConversation(match.sessionId);
                        }}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {match.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm text-foreground">{match.snippet}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </Card>
        </div>
      ) : null}

      {pendingDeleteId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur">
          <Card className="w-[min(420px,90vw)] space-y-4 border shadow-2xl p-6">
            <div>
              <h3 className="text-lg font-semibold">Delete conversation?</h3>
              <p className="text-sm text-muted-foreground">
                This will remove the entire history for this conversation. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void deleteConversation(pendingDeleteId).finally(() => setPendingDeleteId(null));
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ConversationSidebar({
  conversations,
  loading,
  activeConversationId,
  onSelect,
  onDelete,
  onNewConversation,
  open,
  onOpenChange,
  collapsed,
  onCollapsedChange,
  onSearch,
  navigate,
  closeSidebar,
}: {
  conversations: ReturnType<typeof useChatSession>['conversations'];
  loading: boolean;
  activeConversationId: string | null;
  onSelect: (id: string) => Promise<void>;
  onDelete: (id: string) => void;
  onNewConversation: () => void;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
  onSearch: () => void;
  navigate: ReturnType<typeof useNavigate>;
  closeSidebar: () => void;
}) {
  const content = (
    <div className={cn('flex h-full flex-col border-r bg-card transition-all duration-200', collapsed ? 'w-20' : 'w-80')}>
      <div className="flex items-center justify-between border-b px-3 py-3">
        {collapsed ? null : (
          <div>
            <button
              type="button"
              onClick={() => {
                onNewConversation();
                closeSidebar();
                navigate('/');
              }}
              className="text-sm font-semibold uppercase tracking-wide text-primary hover:underline"
            >
              Conversations
            </button>
            <p className="text-xs text-muted-foreground">
              {conversations.length} {conversations.length === 1 ? 'thread' : 'threads'}
            </p>
          </div>
        )}
        <div className="flex items-center gap-1">
          {!collapsed ? (
            <Button size="icon" variant="ghost" onClick={onSearch}>
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
            </Button>
          ) : null}
          <Button size="icon" variant="ghost" onClick={() => onCollapsedChange(!collapsed)}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="border-b px-3 py-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <Button size="icon" variant="ghost" onClick={onNewConversation}>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onSearch}>
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={onNewConversation}>
              <Plus className="h-4 w-4" />
              New conversation
            </Button>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2" onClick={onSearch}>
              <SearchIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Search conversations</span>
            </div>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1 px-2 py-4">
        {collapsed ? null : loading ? (
          <p className="px-2 text-sm text-muted-foreground">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className="space-y-2">
            {conversations.map((conversation) => {
              const isActive = conversation.sessionId === activeConversationId;
              return (
                <li key={conversation.sessionId}>
                  <div
                    className={cn(
                      'group flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition',
                      isActive ? 'border-primary bg-primary/10 text-primary' : 'border-transparent bg-transparent hover:border-border hover:bg-muted'
                    )}
                  >
                    <button type="button" className="flex-1 text-left" onClick={() => onSelect(conversation.sessionId)}>
                      <p className="text-sm font-semibold">
                        {conversation.title?.trim() || conversation.lastMessagePreview || 'Untitled conversation'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(conversation.lastMessageAt ?? conversation.updatedAt ?? '').toLocaleString()}
                      </p>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground opacity-0 transition group-hover:opacity-100"
                      onClick={() => onDelete(conversation.sessionId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <>
      <div className="hidden lg:flex">{content}</div>
      {open ? (
        <div className="fixed inset-0 z-30 bg-background/80 backdrop-blur lg:hidden" onClick={() => onOpenChange(false)}>
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            {content}
          </div>
        </div>
      ) : null}
    </>
  );
}
