import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

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
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden flex-1 items-center justify-center bg-muted lg:flex">
        <img
          src="/login-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
        <div className="relative z-10 max-w-md rounded-3xl bg-background/80 p-8 shadow-xl backdrop-blur">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">Welcome to</p>
          <h2 className="mt-2 text-3xl font-semibold">NexusNote MCP</h2>
          <p className="mt-4 text-sm text-muted-foreground">
            Debate, search, and ideate with a companion tuned for thoughtful conversations.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-10">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Authenticate with your NexusNote account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            {initializing ? (
              <p className="text-sm text-muted-foreground">Checking your session…</p>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="username">
                    Username
                  </label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    aria-describedby={errorId}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    aria-describedby={errorId}
                    disabled={loading}
                  />
                </div>
                {combinedError ? (
                  <p className="text-sm text-destructive" id={errorId} role="alert" aria-live="assertive">
                    {combinedError}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
