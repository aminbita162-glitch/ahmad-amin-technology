import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  Handle,
} from "@/lib/session";
import {
  createServiceClient,
  isSupabaseConfigured,
  readMessages,
  writeMessage,
  readChats,
  writeChat,
  updateChat,
  deleteChat,
  MessageRow,
  ChatRow,
} from "@/lib/thread";

/**
 * Phase 5 + R7 — Thread + Chats server route.
 *
 * GET  /api/messages  — list recent messages (live only).
 * POST /api/messages  — send a message from the signed-in handle.
 *
 * The sync path waits for Supabase. When all three env values are
 * present, the route talks to the live database. When any is empty,
 * the route returns offline:true so the UI shows the honest line:
 * "The server path is ready. Sync waits for Supabase."
 *
 * The body also carries a `action` field so the same route serves
 * chat CRUD (create, rename, pin, delete, list) alongside messages.
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
    return NextResponse.json({ offline: true, messages: [], chats: [] });
  }

  const client = createServiceClient();
  if (!client) {
    return NextResponse.json({ offline: true, messages: [], chats: [] });
  }

  const messages = await readMessages(client);
  const chats = await readChats(client, handle);
  return NextResponse.json({ offline: false, messages, chats });
}

export async function POST(request: NextRequest) {
  const handle = handleFromRequest(request);
  if (!handle) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    body?: string;
    chat_id?: number;
    action?: string;
    name?: string;
    chatId?: number;
    pinned?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "send";

  // --- Chat CRUD actions ---
  if (action === "create_chat") {
    const name = typeof body.name === "string" ? body.name : "";
    if (name.length < 1 || name.length > 200) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ offline: true, chat: null });
    }
    const client = createServiceClient();
    if (!client) {
      return NextResponse.json({ offline: true, chat: null });
    }
    const chat = await writeChat(client, handle, name);
    return NextResponse.json({ offline: false, chat });
  }

  if (action === "rename_chat") {
    const chatId = typeof body.chatId === "number" ? body.chatId : -1;
    const name = typeof body.name === "string" ? body.name : "";
    if (chatId < 0 || name.length < 1 || name.length > 200) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ offline: true, chat: null });
    }
    const client = createServiceClient();
    if (!client) {
      return NextResponse.json({ offline: true, chat: null });
    }
    const chat = await updateChat(client, chatId, { name });
    return NextResponse.json({ offline: false, chat });
  }

  if (action === "pin_chat") {
    const chatId = typeof body.chatId === "number" ? body.chatId : -1;
    const pinned = typeof body.pinned === "boolean" ? body.pinned : false;
    if (chatId < 0) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ offline: true, chat: null });
    }
    const client = createServiceClient();
    if (!client) {
      return NextResponse.json({ offline: true, chat: null });
    }
    const chat = await updateChat(client, chatId, { pinned });
    return NextResponse.json({ offline: false, chat });
  }

  if (action === "delete_chat") {
    const chatId = typeof body.chatId === "number" ? body.chatId : -1;
    if (chatId < 0) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ offline: true, deleted: false });
    }
    const client = createServiceClient();
    if (!client) {
      return NextResponse.json({ offline: true, deleted: false });
    }
    const deleted = await deleteChat(client, chatId);
    return NextResponse.json({ offline: false, deleted });
  }

  // --- Default action: send a message ---
  const text = typeof body.body === "string" ? body.body : "";
  if (text.length < 1 || text.length > 4000) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      offline: true,
      sent: false,
      message: null,
    });
  }

  const client = createServiceClient();
  if (!client) {
    return NextResponse.json({
      offline: true,
      sent: false,
      message: null,
    });
  }

  const chatId = typeof body.chat_id === "number" ? body.chat_id : undefined;
  const row = await writeMessage(client, handle, text, chatId);
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

// Re-export types for route consumers
export type { MessageRow, ChatRow };
