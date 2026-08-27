"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, authError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // If the backend explicitly rejected the JWT, surface it on the login
      // page so the user (and developer) can see what went wrong instead of
      // experiencing a silent redirect loop.
      if (authError) {
        router.replace("/auth/login?error=session");
      } else {
        router.replace("/auth/login");
      }
    }
  }, [loading, user, authError, router]);

  // Show loading screen only on the very first load (no user resolved yet).
  // If a user already exists, keep rendering the app while any background
  // auth check runs so switching tabs never shows a blank loading screen.
  if (loading && user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
