"use client";

import Link from "next/link";

export default function AuthSignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] px-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-card p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-surface-border bg-[#0f1419]">
          <svg
            className="h-6 w-6 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-white">Access by invitation only</h1>
        <p className="mt-3 text-sm text-slate-400">
          New accounts must be created by an administrator. Self-registration is
          not available.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          If you need access, please contact your system administrator and ask
          them to add your email to the application.
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-block rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
