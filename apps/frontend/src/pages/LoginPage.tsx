import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login, loading, error, user, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const combinedError = formError || error;
  const errorId = combinedError ? 'login-form-error' : undefined;

  useEffect(() => {
    if (!initializing && user) {
      const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/chat';
      navigate(redirectTo, { replace: true });
    }
  }, [user, initializing, location, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedPassword = password.trim();

    if (!sanitizedEmail || !sanitizedPassword) {
      setFormError('Username and password are required.');
      return;
    }

    setEmail(sanitizedEmail);
    setPassword(sanitizedPassword);

    try {
      await login({ email: sanitizedEmail, password: sanitizedPassword });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in.';
      setFormError(message);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-hero" aria-hidden="true">
        <img src="/login-hero.jpg" alt="" />
      </div>
      <div className="login-panel">
        <div className="login-panel-content">
          <header className="login-header">
            <h1 className="login-app-name">Chat, MCP</h1>
          </header>
          {initializing ? (
            <p className="login-status">Checking your session…</p>
          ) : (
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <label className="login-label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="login-input"
                aria-describedby={errorId}
                disabled={loading}
              />
              <label className="login-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="login-input"
                aria-describedby={errorId}
                disabled={loading}
              />
              {combinedError && (
                <p className="login-error" id={errorId} role="alert" aria-live="assertive">
                  {combinedError}
                </p>
              )}
              <div className="login-actions">
                <button className="login-submit" type="submit" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
