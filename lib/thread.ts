import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Handle } from "@/lib/session";

/**
 * Phase 4 — Data Seal: server-side thread reader stub.
 *
 * The Supabase URL and anon key are read from the environment. No
 * service-role key is ever referenced here. If the env is empty, the
 * reader stays null and callers must treat the thread as offline.
 *
 * The live schema (supabase/schema.sql) is NOT applied by the worker.
 * It is BLOCKED until a human runs the script. This module builds the
 * code path so Phase 5 can wire the thread route once the database is
 * live.
 */

export interface MessageRow {
  id: number;
  sender: Handle;
  body: string;
  created_at: string;
}

export interface ThreadState {
  live: boolean;
  messages: MessageRow[];
}

function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function isSupabaseConfigured(): boolean {
  return supabaseUrl() !== "" && supabaseAnonKey() !== "";
}

export function createThreadClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return null;
  // Anon key only. The service-role key never enters client code.
  return createClient(url, anonKey);
}

export async function readMessages(
  client: SupabaseClient,
  limit = 200,
): Promise<MessageRow[]> {
  const { data, error } = await client
    .from("messages")
    .select("id, sender, body, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as MessageRow[];
}
