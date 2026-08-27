"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { api, setApiToken } from "@/lib/api";

export type User = {
  id: string;
  username: string;
  role: string;
  allowed_modules: string[];
};

type AuthState = {
  user: User | null;
  loading: boolean;
  authError: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchMeFromApi(accessToken: string): Promise<User> {
  return api<User>("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();

    // Prefer getUser() over getSession() — validates the token against the
    // Supabase server so we are never working with a stale/invalid session.
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      // No active session – clear state quietly.
      setApiToken(null);
      setUser(null);
      setAuthError(null);
      setLoading(false);
      return;
    }

    // Also fetch the session so we have the raw access_token for the API.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setApiToken(null);
      setUser(null);
      setAuthError("Supabase session has no access token.");
      setLoading(false);
      return;
    }

    // Share token with api.ts so all api() calls have it immediately.
    setApiToken(token);

    try {
      const me = await fetchMeFromApi(token);
      setUser(me);
      setAuthError(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown error from /auth/me";

      console.error(
        "[AuthProvider] /api/v1/auth/me failed.\n" +
          "  • Make sure SUPABASE_JWT_SECRET in backend/.env matches\n" +
          "    Project Settings → API → JWT Settings in your Supabase dashboard.\n" +
          "  • Restart uvicorn after updating .env.\n" +
          "  Raw error: " +
          message,
      );

      setApiToken(null);
      setUser(null);
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Initial load.
    refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // On sign-out or token expiry clear immediately without an API call.
      if (event === "SIGNED_OUT" || !session) {
        setApiToken(null);
        setUser(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      const token = session.access_token;
      if (!token) {
        setApiToken(null);
        setUser(null);
        setAuthError("Session has no access_token after auth state change.");
        setLoading(false);
        return;
      }

      // Share token with api.ts immediately so any concurrent api() calls
      // have a valid Authorization header even before /auth/me completes.
      setApiToken(token);

      // Only re-fetch /auth/me on a genuine new sign-in. All other events
      // (TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION) are background
      // lifecycle events — just update the token above and return silently
      // so switching tabs never triggers a loading screen or re-fetch.
      if (event !== "SIGNED_IN") return;

      setLoading(true);
      try {
        const me = await fetchMeFromApi(token);
        setUser(me);
        setAuthError(null);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error from /auth/me";

        console.error(
          `[AuthProvider] onAuthStateChange(${event}): /api/v1/auth/me failed.\n` +
            "  • Verify SUPABASE_JWT_SECRET in backend/.env matches the Supabase\n" +
            "    dashboard value (Project Settings → API → JWT Settings).\n" +
            "  Raw error: " +
            message,
        );

        setApiToken(null);
        setUser(null);
        setAuthError(message);
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  const logout = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setApiToken(null);
    setUser(null);
    setAuthError(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, authError, refresh, logout }),
    [user, loading, authError, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
