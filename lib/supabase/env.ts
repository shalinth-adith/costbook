/**
 * The two values a Supabase project hands you, read once and checked once.
 *
 * Read through here rather than off `process.env` at each call site, so a
 * missing key fails with a sentence that says what to do — not at the first
 * query with "Invalid URL", which is where half an evening goes.
 */

export interface SupabaseEnv {
  readonly url: string;
  readonly anonKey: string;
}

export class MissingSupabaseEnv extends Error {
  constructor(name: string) {
    super(
      `${name} is not set. Copy .env.example to .env.local and fill it in from ` +
        `your Supabase project (Project Settings → API Keys). Restart the dev ` +
        `server afterwards — env is read at boot, not per request.`,
    );
    this.name = 'MissingSupabaseEnv';
  }
}

export function supabaseEnv(): SupabaseEnv {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

  if (url === undefined || url === '') throw new MissingSupabaseEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (anonKey === undefined || anonKey === '') {
    throw new MissingSupabaseEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return { url, anonKey };
}

/**
 * Whether the project is wired up at all.
 *
 * The application still runs on the in-memory store without it, which is what
 * let every screen be built and reviewed before a database existed. Nothing
 * calls Supabase until this is true, so a half-finished .env.local degrades to
 * the fixture book rather than to a stack trace.
 */
export function supabaseConfigured(): boolean {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  return url !== undefined && url !== '' && key !== undefined && key !== '';
}
