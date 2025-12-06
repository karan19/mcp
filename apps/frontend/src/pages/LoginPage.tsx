import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
    <div className="flex min-h-screen w-full lg:grid lg:grid-cols-2">
      {/* Left Column - Branding Showcase (Desktop Only) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        {/* Ambient Blur Orbs */}
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-purple-600/30 blur-3xl filter" />
        <div className="absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl filter" />

        {/* Glassmorphism Branding */}
        <div className="relative z-10 flex h-full flex-col justify-center">
          <div className="mb-8">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-white mb-4">NexusNote</h1>
            <p className="max-w-md text-lg text-slate-300">
              Your intelligent companion for thoughtful conversations, debate, and ideation.
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 p-6 backdrop-blur-md border border-white/10">
            <div className="flex gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-white">Advanced AI</h3>
                <p className="text-sm text-slate-400 mt-1">Powered by state-of-the-art language models.</p>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">Secure</h3>
                <p className="text-sm text-slate-400 mt-1">Enterprise-grade security for your data.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          © 2024 NexusNote Inc. All rights reserved.
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex items-center justify-center bg-white p-6 lg:p-12">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">
              Enter your credentials to access your account
            </p>
          </div>

          {initializing ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-purple-600"></div>
            </div>
          ) : (
            <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                    Email address
                  </label>
                  <div className="mt-1">
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 sm:text-sm"
                      placeholder="you@example.com"
                      aria-describedby={errorId}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <div className="text-sm">
                      <a href="#" className="font-medium text-purple-600 hover:text-purple-500">
                        Forgot your password?
                      </a>
                    </div>
                  </div>
                  <div className="mt-1">
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 placeholder-slate-400 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500 sm:text-sm"
                      placeholder="••••••••"
                      aria-describedby={errorId}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {combinedError && (
                <div className="rounded-md bg-red-50 p-4" id={errorId} role="alert" aria-live="assertive">
                  <div className="flex">
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Login failed</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{combinedError}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="group relative flex w-full justify-center rounded-lg border border-transparent bg-gradient-to-r from-blue-600 to-purple-600 py-2 px-4 text-sm font-medium text-white hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 shadow-lg transition-all duration-200"
                >
                  {loading ? (
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : null}
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
