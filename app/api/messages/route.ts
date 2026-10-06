import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  Handle,
} from "@/lib/session";
import {
  createThreadClient,
  isSupabaseConfigured,
  readMessages,
  writeMessage,
  MessageRow,
} from "@/lib/thread";

/**
 * Phase 5 — Thread server route.
 *
 * GET  /api/messages  — list recent messages (live only).
 * POST /api/messages  — send a message from the signed-in handle.
 *
 * When Supabase env is empty, the route returns offline:true so the
 * client keeps the thread in memory and shows "sync is offline". The
 * local mode never claims the brother received the message.
 */

function handleFromRequest(request: NextRequest): Handle | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (payload.handle !== "amin" && payload.handle !== "ahmad") return null;
  return payload.handle;
}

export async function GET(request: NextRequest) {
  const handle = handleFromRequest(request);
  if (!handle) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    // Offline: the client holds the thread in memory.
    return NextResponse.json({ offline: true, messages: [] });
  }

  const client = createThreadClient();
  if (!client) {
    return NextResponse.json({ offline: true, messages: [] });
  }

  const messages = await readMessages(client);
  return NextResponse.json({ offline: false, messages });
}

export async function POST(request: NextRequest) {
  const handle = handleFromRequest(request);
  if (!handle) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { body?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body : "";
  if (text.length < 1 || text.length > 4000) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    // Offline: never claim the brother received the message. Return the
    // local echo only so the sender sees their own line in-memory.
    return NextResponse.json({
      offline: true,
      sent: false,
      message: null,
    });
  }

  const client = createThreadClient();
  if (!client) {
    return NextResponse.json({
      offline: true,
      sent: false,
      message: null,
    });
  }

  const row = await writeMessage(client, handle, text);
  if (!row) {
    return NextResponse.json(
      { offline: false, sent: false, message: null },
      { status: 500 },
    );
  }

  return NextResponse.json({
    offline: false,
    sent: true,
    message: row as MessageRow,
  });
}
