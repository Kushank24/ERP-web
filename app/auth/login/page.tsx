"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";

export default function AuthLoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Redirect to dashboard if already authenticated.
  useEffect(() => {
    if (!authLoading && user) router.replace("/dashboard");
  }, [authLoading, user, router]);

  // Surface URL-param errors (e.g. from /auth/callback or session failure).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (errParam === "auth") {
      setError("Email link failed or expired. Please try again.");
    } else if (errParam === "session") {
      setError(
        "Your session could not be verified by the API. " +
          "Make sure SUPABASE_JWT_SECRET in backend/.env matches " +
          "Project Settings → API → JWT Settings in your Supabase dashboard, " +
          "then restart uvicorn.",
      );
    }
  }, []);

  // If the user just logged in but the backend rejected access, surface the
  // error so it is visible rather than silently looping back to login.
  useEffect(() => {
    if (!authLoading && !user && authError) {
      if (authError.toLowerCase().includes("access not authorized")) {
        setError(
          "Your account is not authorized to access this application. " +
            "Please contact your administrator to request access.",
        );
        // Sign out of Supabase so the user isn't stuck with a valid
        // Supabase session but no app access.
        createClient().auth.signOut();
      } else {
        setError(
          `API auth failed: ${authError} — ` +
            "Check that SUPABASE_JWT_SECRET in backend/.env matches the " +
            "JWT Secret in your Supabase project dashboard and restart uvicorn.",
        );
      }
    }
  }, [authLoading, user, authError]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createClient();
    const { error: supabaseErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);

    if (supabaseErr) {
      setError(supabaseErr.message);
      return;
    }

    // Supabase login succeeded — navigate to the dashboard.
    // RequireAuth will redirect back here if the backend cannot verify the JWT.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white">E-Safe ERP</h1>
        <p className="mt-1 text-sm text-slate-400">
          Sign in with your Supabase account
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400">
              Email
            </label>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400">
              Password
            </label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2 text-sm text-white outline-none focus:border-accent"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2"
              role="alert"
            >
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-surface-border bg-[#0f1419] px-3 py-2">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-400">Troubleshooting:</span>{" "}
            If you see an &quot;API auth failed&quot; error after a successful
            login, open{" "}
            <span className="font-mono text-slate-400">backend/.env</span> and
            make sure{" "}
            <code className="text-slate-400">SUPABASE_JWT_SECRET</code> matches
            the value at{" "}
            <span className="italic">
              Supabase Dashboard → Project Settings → API → JWT Settings → JWT
              Secret
            </span>
            , then restart uvicorn.
          </p>
        </div>
      </div>
    </div>
  );
}
