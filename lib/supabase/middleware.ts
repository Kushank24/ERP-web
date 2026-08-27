import { NextResponse, type NextRequest } from "next/server";

// All pages in this app are client-rendered ("use client") and auth is
// validated by the FastAPI backend on every API call. There is no Server
// Component that needs a server-side Supabase session, so we do not call
// supabase.auth.getSession() here — that call can trigger a Supabase auth
// server round-trip which shows up as "The user aborted a request. Retrying"
// spam in development and adds latency on every page navigation.
// Token refresh is handled entirely by the Supabase onAuthStateChange listener
// in the browser (auth-context.tsx).
export function updateSession(request: NextRequest) {
  return NextResponse.next({ request });
}
