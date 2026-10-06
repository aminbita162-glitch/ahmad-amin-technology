"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  POLL_INTERVAL_MS,
  shouldPoll,
} from "@/lib/thread";

/**
 * Phase 5 + Phase 6 — Thread (chamber) + Model Room.
 *
 * If Supabase env is empty, the thread stays in memory for the open
 * session and the UI shows the exact line: "sync is offline". Local
 * mode never claims the brother received the message.
 *
 * If env exists, send through the server route, subscribe on the
 * client with the anon key, and fall back to GET polling every
 * 3000 ms when the channel status is not "joined".
 *
 * Bubbles identify Amin or Ahmad and show fa-IR time.
 *
 * The model tab (Phase 6) is an isolated room — no shared history with
 * the brother thread. The client sends a model flag and at most 8
 * messages to /api/chat. Bubble names are Amin and Ahmad, English only.
 */

interface Bubble {
  id: number;
  sender: "amin" | "ahmad";
  body: string;
  created_at: string;
}

interface ModelTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const MAX_MODEL_MESSAGES = 8;

export default function ChamberPage() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [syncOffline, setSyncOffline] = useState(true);
  const [sessionHandle, setSessionHandle] = useState<"amin" | "ahmad" | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelStatusRef = useRef<string>("");

  // Phase 6 — Model Room state (isolated from the thread).
  const [tab, setTab] = useState<"thread" | "model">("thread");
  const [modelDraft, setModelDraft] = useState("");
  const [modelHistory, setModelHistory] = useState<ModelTurn[]>([]);
  const [modelFlag, setModelFlag] = useState<"gpt-4o-mini" | "gpt-4o">("gpt-4o-mini");
  const [modelOffline, setModelOffline] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { method: "GET" });
      if (res.status === 401) return;
      const data = await res.json();
      if (data.handle === "amin" || data.handle === "ahmad") {
        setSessionHandle(data.handle);
      }
    } catch {
      // ignore — offline
    }
  }, []);

  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setBubbles(data.messages as Bubble[]);
      }
    } catch {
      // ignore — offline
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => {
      if (shouldPoll(channelStatusRef.current)) {
        pollMessages();
      }
    }, POLL_INTERVAL_MS);
  }, [pollMessages]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const initRealtime = useCallback(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    if (clientRef.current) return;
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    clientRef.current = client;
    const channel = client.channel("messages");
    channelRef.current = channel;
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const row = payload.new as Bubble;
      if (row && row.sender && row.body) {
        setBubbles((prev) => {
          if (prev.some((b) => b.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      }
    });
    channel.subscribe((status: string) => {
      channelStatusRef.current = status;
      if (status === "joined") {
        setSyncOffline(false);
        stopPolling();
      } else {
        startPolling();
      }
    });
    startPolling();
  }, [startPolling, stopPolling]);

  useEffect(() => {
    fetchSession();
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      setSyncOffline(false);
      initRealtime();
      pollMessages();
    } else {
      setSyncOffline(true);
    }
    return () => {
      stopPolling();
      if (channelRef.current && clientRef.current) {
        clientRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      clientRef.current = null;
    };
  }, [fetchSession, initRealtime, pollMessages, stopPolling]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !sessionHandle) return;
    // Optimistic local echo — the sender sees their line immediately.
    const optimistic: Bubble = {
      id: Date.now(),
      sender: sessionHandle,
      body: text,
      created_at: new Date().toISOString(),
    };
    setBubbles((prev) => [...prev, optimistic]);
    setDraft("");
    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!syncOffline) pollMessages();
    } catch {
      // offline — the optimistic echo stays but we never claim the
      // brother received the message.
    }
  }, [draft, sessionHandle, syncOffline, pollMessages]);

  // Phase 6 — Model Room send. Isolated from the thread: sends a model
  // flag and at most 8 messages to /api/chat. No shared history with the
  // brother thread. Bubble names are Amin and Ahmad, English only.
  const sendModel = useCallback(async () => {
    const text = modelDraft.trim();
    if (!text || !sessionHandle || modelLoading) return;

    // Build the message list for this turn. The user's new line is
    // appended, then the whole list is sliced to at most 8 before the
    // call — the ninth history item is dropped.
    const userTurn: ModelTurn = {
      id: Date.now(),
      role: "user",
      content: text,
    };
    const outgoing: ModelTurn[] = [...modelHistory, userTurn];
    const sliced = outgoing.slice(-MAX_MODEL_MESSAGES);

    setModelHistory((prev) => [...prev, userTurn]);
    setModelDraft("");
    setModelLoading(true);
    setModelError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelFlag,
          messages: sliced.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.status === 429) {
        setModelError("rate limit reached — try again later");
        setModelLoading(false);
        return;
      }

      if (res.status === 401) {
        setModelError("unauthorized");
        setModelLoading(false);
        return;
      }

      const data = await res.json();

      if (data.offline === true) {
        // Key is missing — the server returns offline true and does
        // NOT imitate a model answer. Show the Persian line.
        setModelOffline(true);
        setModelLoading(false);
        return;
      }

      const reply = typeof data.reply === "string" ? data.reply : "";
      if (reply) {
        const assistantTurn: ModelTurn = {
          id: Date.now() + 1,
          role: "assistant",
          content: reply,
        };
        setModelHistory((prev) => [...prev, assistantTurn]);
      }
      setModelOffline(false);
    } catch {
      setModelError("request failed");
    } finally {
      setModelLoading(false);
    }
  }, [modelDraft, sessionHandle, modelLoading, modelFlag, modelHistory]);

  const handleLabel = (sender: "amin" | "ahmad") =>
    sender === "amin" ? "امین" : "احمد";

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <>
      <div className="meridian-line" />
      <div className="ring ring--amin" />
      <div className="ring ring--ahmad" />
      <main className="chamber">
        <nav className="chamber__tabs" aria-label="chamber tabs">
          <button
            type="button"
            className={`chamber__tab${tab === "thread" ? " chamber__tab--active" : ""}`}
            onClick={() => setTab("thread")}
          >
            Thread
          </button>
          <button
            type="button"
            className={`chamber__tab${tab === "model" ? " chamber__tab--active" : ""}`}
            onClick={() => setTab("model")}
          >
            Model
          </button>
        </nav>

        {tab === "thread" && (
          <>
            <header className="chamber__header">
              <h1 className="chamber__title">اتاق</h1>
              <p className="chamber__sync">
                {syncOffline ? "sync is offline" : "sync is live"}
              </p>
            </header>
            <div className="chamber__thread" aria-label="message thread">
              {bubbles.length === 0 && (
                <p className="chamber__empty">پیامی نیست</p>
              )}
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className={`bubble bubble--${b.sender}`}
                  data-sender={b.sender}
                >
                  <span className="bubble__handle">{handleLabel(b.sender)}</span>
                  <span className="bubble__body">{b.body}</span>
                  <span className="bubble__time">{formatTime(b.created_at)}</span>
                </div>
              ))}
            </div>
            <form className="chamber__compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input
                type="text"
                className="chamber__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={4000}
                placeholder="پیام بنویس"
                disabled={!sessionHandle}
                aria-label="message input"
              />
              <button type="submit" className="chamber__send" disabled={!sessionHandle || !draft.trim()}>
                ارسال
              </button>
            </form>
          </>
        )}

        {tab === "model" && (
          <>
            <header className="chamber__header">
              <h1 className="chamber__title">Model Room</h1>
              <p className="chamber__sync">
                {modelOffline ? "model is offline" : "model is live"}
              </p>
            </header>
            <div className="chamber__model-controls">
              <label className="chamber__model-label">
                <span className="chamber__model-label-text">Model</span>
                <select
                  className="chamber__model-select"
                  value={modelFlag}
                  onChange={(e) => {
                    const v = e.target.value;
                    setModelFlag(v === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini");
                  }}
                  aria-label="model flag"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </label>
            </div>
            <div className="chamber__model" aria-label="model conversation">
              {modelHistory.length === 0 && (
                <p className="chamber__empty">
                  {modelOffline
                    ? "مسیر سرور آماده است، اما کلید مدل موجود نیست."
                    : "Ask the model"}
                </p>
              )}
              {modelHistory.map((m) => (
                <div
                  key={m.id}
                  className={`model-turn model-turn--${m.role}`}
                  data-role={m.role}
                >
                  <span className="model-turn__name">
                    {m.role === "user"
                      ? sessionHandle === "amin"
                        ? "Amin"
                        : "Ahmad"
                      : "Assistant"}
                  </span>
                  <span className="model-turn__body">{m.content}</span>
                </div>
              ))}
              {modelError && (
                <p className="chamber__model-error">{modelError}</p>
              )}
            </div>
            <form
              className="chamber__compose"
              onSubmit={(e) => { e.preventDefault(); sendModel(); }}
            >
              <input
                type="text"
                className="chamber__input"
                value={modelDraft}
                onChange={(e) => setModelDraft(e.target.value)}
                maxLength={4000}
                placeholder="Ask the model"
                disabled={!sessionHandle || modelLoading}
                aria-label="model input"
              />
              <button
                type="submit"
                className="chamber__send"
                disabled={!sessionHandle || !modelDraft.trim() || modelLoading}
              >
                {modelLoading ? "..." : "Send"}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
