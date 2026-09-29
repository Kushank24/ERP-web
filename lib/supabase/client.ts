import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "./env";

// A single shared instance avoids multiple clients competing for the same
// navigator lock ("lock was released because another request stole it").
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  }
  return _client;
}
