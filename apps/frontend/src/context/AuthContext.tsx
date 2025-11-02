import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession, getCurrentUser, signIn, signOut } from 'aws-amplify/auth';

interface User {
  username: string;
  email: string;
  displayName: string;
  groups: string[];
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  loading: boolean;
  initializing: boolean;
  error: string | null;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normaliseGroups(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }

  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

async function buildUser(): Promise<User | null> {
  try {
    const current = await getCurrentUser();
    const session = await fetchAuthSession();

    const emailFromLogin = current?.signInDetails?.loginId;
    const emailFromToken = session.tokens?.idToken?.payload?.email as string | undefined;
    const email = (emailFromLogin ?? emailFromToken ?? current.username).toLowerCase();

    const groupsRaw = session.tokens?.idToken?.payload?.['cognito:groups'];
    const groups = normaliseGroups(groupsRaw);

    const displayName = email.includes('@') ? email.split('@')[0] : current.username;

    return {
      username: current.username,
      email,
      displayName,
      groups,
    };
  } catch (err) {
    console.warn('No authenticated user found or session retrieval failed.', err);
    return null;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hydrateUser = useCallback(async () => {
    const fetched = await buildUser();
    setUser(fetched);
    if (fetched) {
      setError(null);
    }
  }, [setError]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await hydrateUser();
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateUser]);

  const login = useCallback(
    async (input: LoginInput) => {
      setLoading(true);
      setError(null);

      try {
        if (!input.email || !input.password) {
          throw new Error('Email and password are required.');
        }

        const output = await signIn({
          username: input.email,
          password: input.password,
        });

        if (output.nextStep.signInStep !== 'DONE') {
          throw new Error(
            `Additional authentication step required: ${output.nextStep.signInStep}. Complete this step in the Cognito console (e.g. MFA or password change).`
          );
        }

        await hydrateUser();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed.';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [hydrateUser]
  );

  const logout = useCallback(() => {
    signOut().catch((err) => {
      console.error('Failed to sign out', err);
    });
    setUser(null);
    setError(null);
  }, []);

  const getIdToken = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() ?? null;
    } catch (err) {
      console.warn('Unable to fetch auth session for id token', err);
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login,
      logout,
      loading,
      initializing,
      error,
      getIdToken,
    }),
    [user, login, logout, loading, initializing, error, getIdToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
