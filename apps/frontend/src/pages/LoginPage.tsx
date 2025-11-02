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

  useEffect(() => {
    if (!initializing && user) {
      const redirectTo = (location.state as { from?: Location })?.from?.pathname ?? '/chat';
      navigate(redirectTo, { replace: true });
    }
  }, [user, initializing, location, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    try {
      await login({ email, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in.';
      setFormError(message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>NexusNote Chat</h1>
        <p className="auth-subtitle">Sign in with your NexusNote credentials to continue.</p>
        {initializing ? (
          <p className="auth-subtitle">Checking your session…</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="auth-input"
              disabled={loading}
            />
            <label className="auth-label" htmlFor="password">
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
              className="auth-input"
              disabled={loading}
            />
            {(formError || error) && <p className="auth-error">{formError || error}</p>}
            <button className="auth-button" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
