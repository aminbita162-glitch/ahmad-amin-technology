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

/**
 * Insert a message server-side. The body length is enforced here (1-4000)
 * so the route never sends a oversized payload to Postgres even if the
 * client bypasses the schema check. Returns the new row or null on error.
 */
export async function writeMessage(
  client: SupabaseClient,
  sender: Handle,
  body: string,
): Promise<MessageRow | null> {
  if (body.length < 1 || body.length > 4000) return null;
  if (sender !== "amin" && sender !== "ahmad") return null;
  const { data, error } = await client
    .from("messages")
    .insert({ sender, body })
    .select("id, sender, body, created_at")
    .single();
  if (error) return null;
  return data as unknown as MessageRow;
}

/**
 * Polling fallback interval — 3000 ms.
 *
 * Iran path: the WebSocket may die. When the realtime channel is not
 * joined, the client falls back to GET polling at this interval.
 */
export const POLL_INTERVAL_MS = 3000;

/**
 * Pure switch: returns true when the realtime channel is NOT joined,
 * so the polling fallback should run. This is the 3000 ms switch.
 *
 * Channel statuses Supabase emits: "connecting", "joined", "closing",
 * "closed", "timed out", "" (initial). Only "joined" means the socket
 * is live — every other state must poll.
 */
export function shouldPoll(channelStatus: string): boolean {
  return channelStatus !== "joined";
}
