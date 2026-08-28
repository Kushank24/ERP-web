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
      setError("Your session could not be verified. Please sign in again.");
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
        createClient().auth.signOut();
      } else {
        setError("Sign-in failed. Please try again or contact your administrator.");
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
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/esafe.png" alt="E-Safe logo" className="h-16 w-auto object-contain" />
          <p className="text-sm text-slate-400">Sign in to your account</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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

      </div>
    </div>
  );
}
