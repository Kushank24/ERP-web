import { createClient } from "@/lib/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// Module-level token store
// ---------------------------------------------------------------------------
// AuthProvider calls setApiToken() whenever it obtains a fresh access token
// from onAuthStateChange or refresh().  This means api() always has the
// latest token without having to call supabase.auth.getSession() — which
// can return null when the session is stored in HttpOnly cookies set by the
// server-side middleware (a known @supabase/ssr behaviour).
// ---------------------------------------------------------------------------

let _accessToken: string | null = null;

/** Called by AuthProvider to keep the module-level token in sync. */
export function setApiToken(token: string | null): void {
  _accessToken = token;
}

/** @deprecated Use Supabase session; kept for any legacy tooling */
export function getToken(): string | null {
  return null;
}

export function setToken(_token: string | null) {
  /* no-op — auth uses Supabase cookies */
}

/**
 * Returns the best available Supabase access token.
 *
 * Priority:
 * 1. Module-level cache set by AuthProvider via setApiToken()  — always up
 *    to date, works even when session cookies are HttpOnly.
 * 2. supabase.auth.getSession() — fallback for cases where AuthProvider has
 *    not yet run (e.g. a component outside the auth tree).
 */
async function getSupabaseAccessToken(): Promise<string | null> {
  // 1. Use the token shared by AuthProvider if available.
  if (_accessToken) return _accessToken;

  // 2. Fallback: read from the Supabase browser client session.
  if (typeof window === "undefined") return null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function api<T>(
  path: string,
  opts: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };

  const token = await getSupabaseAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = opts.body;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  const res = await fetch(`${API}${path}`, { ...opts, headers, body });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      if (Array.isArray(err.detail)) {
        detail = err.detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join("; ");
      } else {
        detail = err.detail ?? JSON.stringify(err);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Like api() but sends a FormData body — use for file upload endpoints.
 * Does NOT set Content-Type (browser sets it with the multipart boundary).
 */
export async function apiFormData<T>(
  path: string,
  formData: FormData,
  method: "POST" | "PUT" | "PATCH" = "POST",
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getSupabaseAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { method, headers, body: formData });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      detail = Array.isArray(err.detail)
        ? err.detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join("; ")
        : (err.detail ?? JSON.stringify(err));
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Like api() but returns the raw Response Blob — use for binary endpoints
 * (PDFs, CSVs, etc.) where the body is not JSON.
 */
export async function apiBlob(
  path: string,
  opts: RequestInit = {},
): Promise<{ blob: Blob; filename: string }> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  const token = await getSupabaseAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await res.json();
      if (Array.isArray(err.detail)) {
        detail = err.detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join("; ");
      } else {
        detail = err.detail ?? JSON.stringify(err);
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : "download";
  const blob = await res.blob();
  return { blob, filename };
}
