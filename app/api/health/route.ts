import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/thread";

/**
 * Phase 7 — Health route.
 *
 * Returns booleans only — no secret values.
 * - session: true if the caller has a valid aa_session cookie.
 * - supabase: true if NEXT_PUBLIC_SUPABASE_URL and anon key are set.
 * - model: true if OPENAI_API_KEY is set.
 */

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const payload = verifySessionToken(token);
  const session = payload !== null;
  const supabase = isSupabaseConfigured();
  const model = (process.env.OPENAI_API_KEY ?? "") !== "";

  return NextResponse.json({ session, supabase, model });
}
