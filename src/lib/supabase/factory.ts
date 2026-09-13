import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { auth0 } from "../auth0";

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new SupabaseConfigurationError("Supabase public configuration is missing.");
  try {
    new URL(url);
  } catch {
    throw new SupabaseConfigurationError("NEXT_PUBLIC_SUPABASE_URL is invalid.");
  }
  return { url, key };
}

export function createBrowserSupabaseClient(): SupabaseClient {
  const { url, key } = config();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    db: { timeout: 8_000, retry: false },
  });
}

export async function createServerSupabaseClient(accessToken?: string): Promise<SupabaseClient> {
  const { url, key } = config();
  let token = accessToken;
  if (!token) {
    const client = auth0();
    if (client) {
      try {
        // Supabase Third-party Auth0 integration validates the ID token. Auth0's
        // access token is an API token and does not carry the ID-token role claim.
        token = (await client.getSession())?.tokenSet.idToken;
      } catch {
        throw new SupabaseConfigurationError("Supabase Auth0 ID token is unavailable.");
      }
    }
  }
  if (!token) throw new SupabaseConfigurationError("Supabase Auth0 ID token is unavailable.");
  return createClient(url, key, {
    accessToken: async () => token ?? null,
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    db: { timeout: 8_000, retry: false },
  });
}

/** Server-only client for operations whose authorization was completed upstream. */
export function createServerSupabaseAdminClient(): SupabaseClient {
  const { url } = config();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new SupabaseConfigurationError("Supabase server secret configuration is missing.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    db: { timeout: 8_000, retry: false },
  });
}
