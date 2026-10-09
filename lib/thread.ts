import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Handle } from "@/lib/session";

/**
 * Phase 4 + R7 — Data Seal: server-side thread + chat reader.
 *
 * The server sync path reads three values from the environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * If any of the three is empty, the sync path stays offline. The
 * route returns offline:true and the UI shows the honest line:
 * "The server path is ready. Sync waits for Supabase."
 *
 * The service-role key is read server-side only — it is never in
 * the client bundle (no NEXT_PUBLIC_ prefix). Only the service
 * client uses it; the anon client (used by the browser) does not.
 */

export interface MessageRow {
  id: number;
  chat_id: number | null;
  sender: Handle;
  body: string;
  created_at: string;
}

export interface ChatRow {
  id: number;
  handle: Handle;
  name: string;
  pinned: boolean;
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

function supabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/**
 * True only when ALL three Supabase env values are present.
 * The server sync path uses this gate.
 */
export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl() !== "" &&
    supabaseAnonKey() !== "" &&
    supabaseServiceRoleKey() !== ""
  );
}

/**
 * Anon client (browser-side). Uses only the anon key.
 */
export function createThreadClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

/**
 * Service client (server-side only). Uses the service-role key.
 * Never referenced from client code — the key is server-only.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = supabaseUrl();
  const serviceKey = supabaseServiceRoleKey();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

export async function readMessages(
  client: SupabaseClient,
  limit = 200,
): Promise<MessageRow[]> {
  const { data, error } = await client
    .from("messages")
    .select("id, chat_id, sender, body, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as MessageRow[];
}

/**
 * Insert a message server-side. The body length is enforced here (1-4000)
 * so the route never sends an oversized payload to Postgres even if the
 * client bypasses the schema check. Returns the new row or null on error.
 */
export async function writeMessage(
  client: SupabaseClient,
  sender: Handle,
  body: string,
  chatId?: number,
): Promise<MessageRow | null> {
  if (body.length < 1 || body.length > 4000) return null;
  if (sender !== "amin" && sender !== "ahmad") return null;
  const payload: Record<string, unknown> = { sender, body };
  if (typeof chatId === "number" && chatId > 0) {
    payload.chat_id = chatId;
  }
  const { data, error } = await client
    .from("messages")
    .insert(payload)
    .select("id, chat_id, sender, body, created_at")
    .single();
  if (error) return null;
  return data as unknown as MessageRow;
}

/**
 * Insert a named chat server-side. Returns the new row or null on error.
 */
export async function writeChat(
  client: SupabaseClient,
  handle: Handle,
  name: string,
): Promise<ChatRow | null> {
  if (handle !== "amin" && handle !== "ahmad") return null;
  if (name.length < 1 || name.length > 200) return null;
  const { data, error } = await client
    .from("chats")
    .insert({ handle, name })
    .select("id, handle, name, pinned, created_at")
    .single();
  if (error) return null;
  return data as unknown as ChatRow;
}

/**
 * Update a chat's name or pinned state. Returns the updated row or null.
 */
export async function updateChat(
  client: SupabaseClient,
  chatId: number,
  patch: Partial<Pick<ChatRow, "name" | "pinned">>,
): Promise<ChatRow | null> {
  const updatePayload: Record<string, unknown> = {};
  if (typeof patch.name === "string") {
    if (patch.name.length < 1 || patch.name.length > 200) return null;
    updatePayload.name = patch.name;
  }
  if (typeof patch.pinned === "boolean") {
    updatePayload.pinned = patch.pinned;
  }
  if (Object.keys(updatePayload).length === 0) return null;
  const { data, error } = await client
    .from("chats")
    .update(updatePayload)
    .eq("id", chatId)
    .select("id, handle, name, pinned, created_at")
    .single();
  if (error) return null;
  return data as unknown as ChatRow;
}

/**
 * Delete a chat and all its messages (cascade).
 */
export async function deleteChat(
  client: SupabaseClient,
  chatId: number,
): Promise<boolean> {
  const { error } = await client.from("chats").delete().eq("id", chatId);
  return !error;
}

/**
 * Read all chats for a handle, ordered pinned first then created_at.
 */
export async function readChats(
  client: SupabaseClient,
  handle: Handle,
): Promise<ChatRow[]> {
  const { data, error } = await client
    .from("chats")
    .select("id, handle, name, pinned, created_at")
    .eq("handle", handle)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as unknown as ChatRow[];
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
