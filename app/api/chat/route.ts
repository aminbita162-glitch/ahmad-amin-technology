import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  getWhitelistUsers,
  Handle,
} from "@/lib/session";

/**
 * Phase 6 — Model Room (server route).
 *
 * The server reads OPENAI_API_KEY. The client sends a model flag and at
 * most 8 messages. The key is never exposed to the client bundle — it is
 * a server-only env var (no NEXT_PUBLIC_ prefix).
 *
 * No shared history with the brother thread: this route is isolated from
 * /api/messages. The model conversation lives in the client's model tab
 * only and is never mixed with the thread.
 */

type ModelFlag = "gpt-4o-mini" | "gpt-4o";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_MESSAGES = 8;
const TEMPERATURE = 0.4;
const RATE_LIMIT_PER_HOUR = 30;
const MAX_TOKENS: Record<ModelFlag, number> = {
  "gpt-4o-mini": 900,
  "gpt-4o": 1200,
};

// Offline line — the server path is ready but the key is absent.
// This is a UI string, not a project artifact label.
const OFFLINE_MESSAGE = "The server path is ready and the model key is absent.";

// In-memory rate limit: handle -> array of request timestamps.
// Acceptable for v1 per the directive.
const rateBuckets = new Map<Handle, number[]>();

function resolveModel(flag: unknown): ModelFlag {
  return flag === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini";
}

function handleFromRequest(request: NextRequest): Handle | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const payload = verifySessionToken(token);
  if (!payload) return null;
  if (payload.handle !== "amin" && payload.handle !== "ahmad") return null;
  return payload.handle;
}

function checkRateLimit(handle: Handle): boolean {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000; // 1 hour rolling window
  const recent = (rateBuckets.get(handle) ?? []).filter((t) => t > windowStart);
  if (recent.length >= RATE_LIMIT_PER_HOUR) {
    rateBuckets.set(handle, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(handle, recent);
  return true;
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (typeof m !== "object" || m === null) continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || content.length === 0) continue;
    out.push({ role, content });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const handle = handleFromRequest(request);
  if (!handle) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { model?: string; messages?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const model = resolveModel(body.model);
  const incoming = sanitizeMessages(body.messages);
  // Slice to at most 8 — the ninth history item is dropped.
  const messages = incoming.slice(0, MAX_MESSAGES);

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    // Key is missing: return offline true and do NOT imitate a model answer.
    return NextResponse.json({
      offline: true,
      reply: null,
      model,
      message: OFFLINE_MESSAGE,
    });
  }

  if (!checkRateLimit(handle)) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: 3600 },
      { status: 429 },
    );
  }

  const users = getWhitelistUsers();
  const user = users.find((u) => u.handle === handle);
  const name = user?.name ?? handle;
  // System line names the signed-in person and demands the user's language.
  const systemLine = `You are speaking with ${name}. Respond in the user's language.`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemLine },
        ...messages,
      ],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS[model],
    });
    const reply = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ offline: false, reply, model });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { offline: false, reply: null, model, error: "Upstream error", detail },
      { status: 502 },
    );
  }
}
