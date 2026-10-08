"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  POLL_INTERVAL_MS,
  shouldPoll,
} from "@/lib/thread";
import Desk from "./desk";

/**
 * Phase 5 + Phase 6 + Options R2 — Thread, Model Room, Local Desk.
 *
 * If Supabase env is empty, the thread stays in memory for the open
 * session and the UI shows the exact line: "sync is offline". Local
 * mode never claims the brother received the message.
 *
 * If env exists, send through the server route, subscribe on the
 * client with the anon key, and fall back to GET polling every
 * 3000 ms when the channel status is not "joined".
 *
 * The model tab (Phase 6) is an isolated room — no shared history with
 * the brother thread. The client sends a model flag and at most 8
 * messages to /api/chat. Bubble names are Amin and Ahmad, English only.
 *
 * The desk tab (Options R2) is a local-only workspace: folders, files,
 * meetings, checklists, voice notes — all in the browser. No server, no
 * new packages. A missing sync path stays labeled "sync is offline".
 */

type Tab = "thread" | "model" | "desk";
type ModelFlag = "gpt-4o-mini" | "gpt-4o";
type Lang = "en" | "fa";

const LANG_KEY = "aa-lang";

const LANG_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    desk: "Desk",
    thread: "Thread",
    model: "Model",
    syncOffline: "sync is offline",
    syncLive: "sync is live",
    modelOffline: "model is offline",
    modelLive: "model is live",
    testHome: "Test Home",
    noMessages: "No messages",
    typeMessage: "Type a message",
    send: "Send",
    modelRoom: "Model Room",
    askModel: "Ask the model",
    modelAbsent: "The server path is ready and the model key is absent.",
  },
  fa: {
    desk: "میز کار",
    thread: "گفت‌گو",
    model: "مدل",
    syncOffline: "همگام‌سازی آفلاین است",
    syncLive: "همگام‌سازی آنلاین است",
    modelOffline: "مدل آفلاین است",
    modelLive: "مدل آنلاین است",
    testHome: "خانه تست",
    noMessages: "پیامی نیست",
    typeMessage: "پیام بنویسید",
    send: "ارسال",
    modelRoom: "اتاق مدل",
    askModel: "از مدل بپرسید",
    modelAbsent: "مسیر سرور آماده است و کلید مدل موجود نیست.",
  },
};

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

interface UnsentEntry {
  id: number;
  sender: "amin" | "ahmad";
  body: string;
  created_at: string;
}

export default function ChamberPage() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [syncOffline, setSyncOffline] = useState(true);
  const [unsent, setUnsent] = useState<UnsentEntry[]>([]);
  const [sessionHandle, setSessionHandle] = useState<"amin" | "ahmad" | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const clientRef = useRef<SupabaseClient | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelStatusRef = useRef<string>("");

  // Phase 6 — Model Room state (isolated from the thread).
  const [tab, setTab] = useState<Tab>("desk");
  const [modelDraft, setModelDraft] = useState("");
  const [modelHistory, setModelHistory] = useState<ModelTurn[]>([]);
  const [modelFlag, setModelFlag] = useState<ModelFlag>("gpt-4o-mini");
  const [modelOffline, setModelOffline] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // Language switch (Options R3) — Persian / English.
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fa" || saved === "en") {
        setLang(saved);
      }
    } catch {
      // ignore — default en
    }
  }, []);

  const changeLang = useCallback((next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
    const el = document.documentElement;
    el.lang = next;
    el.dir = next === "fa" ? "rtl" : "ltr";
  }, []);

  const t = LANG_LABELS[lang];

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
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: { new: Bubble }) => {
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

  // Phase 7 — Register the service worker from the chamber only.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failed — the app still works without offline caching.
      });
    }
  }, []);

  // Control 15 — Logout button.
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — proceed to redirect anyway
    }
    window.location.href = "/";
  }, []);

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
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok && !syncOffline) {
        pollMessages();
      } else if (syncOffline) {
        // Offline send becomes a local queue labeled unsent.
        setUnsent((prev) => [
          ...prev,
          { id: optimistic.id, sender: sessionHandle, body: text, created_at: optimistic.created_at },
        ]);
      }
    } catch {
      // Offline — the optimistic echo stays but we never claim the
      // brother received the message. Queue as unsent.
      setUnsent((prev) => [
        ...prev,
        { id: optimistic.id, sender: sessionHandle, body: text, created_at: optimistic.created_at },
      ]);
    }
  }, [draft, sessionHandle, syncOffline, pollMessages]);

  // Phase 6 — Model Room send. Isolated from the thread: sends a model
  // flag and at most 8 messages to /api/chat. No shared history with the
  // brother thread. Bubble names are Amin and Ahmad, English only.
  const sendModel = useCallback(async () => {
    const text = modelDraft.trim();
    if (!text || !sessionHandle || modelLoading) return;

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

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("en-GB", {
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
      <div className="lang-switch" aria-label="language switch">
        <button
          type="button"
          className={`lang-switch__btn${lang === "en" ? " lang-switch__btn--active" : ""}`}
          onClick={() => changeLang("en")}
          aria-label="English"
        >
          EN
        </button>
        <button
          type="button"
          className={`lang-switch__btn${lang === "fa" ? " lang-switch__btn--active" : ""}`}
          onClick={() => changeLang("fa")}
          aria-label="Persian"
        >
          فا
        </button>
      </div>
      <main className="chamber">
        <nav className="chamber__tabs" aria-label="chamber tabs">
          <button
            type="button"
            className={`chamber__tab${tab === "desk" ? " chamber__tab--active" : ""}`}
            onClick={() => setTab("desk")}
          >
            {t.desk}
          </button>
          <button
            type="button"
            className={`chamber__tab${tab === "thread" ? " chamber__tab--active" : ""}`}
            onClick={() => setTab("thread")}
          >
            {t.thread}
          </button>
          <button
            type="button"
            className={`chamber__tab${tab === "model" ? " chamber__tab--active" : ""}`}
            onClick={() => setTab("model")}
          >
            {t.model}
          </button>
        </nav>

        {tab === "desk" && (
          <Desk
            modelFlag={modelFlag}
            setModelFlag={setModelFlag}
            syncOffline={syncOffline}
            modelOffline={modelOffline}
            onLogout={logout}
            lang={lang}
          />
        )}

        {tab === "thread" && (
          <>
            <header className="chamber__header">
              <h1 className="chamber__title">{t.thread}</h1>
              <p className="chamber__sync">
                {syncOffline ? t.syncOffline : t.syncLive}
              </p>
            </header>
            <div className="chamber__thread" aria-label="message thread">
              {bubbles.length === 0 && (
                <p className="chamber__empty">{t.noMessages}</p>
              )}
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className={`bubble bubble--${b.sender}`}
                  data-sender={b.sender}
                >
                  <span className="bubble__handle">{b.sender}</span>
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
                placeholder={t.typeMessage}
                disabled={!sessionHandle}
                aria-label="message input"
              />
              <button type="submit" className="chamber__send" disabled={!sessionHandle || !draft.trim()}>
                {t.send}
              </button>
            </form>
            {unsent.length > 0 && (
              <div className="chamber__unsent" aria-label="unsent queue">
                <p className="chamber__unsent-label">unsent ({unsent.length})</p>
                <ul className="chamber__unsent-list">
                  {unsent.map((u) => (
                    <li key={u.id} className="chamber__unsent-item">
                      <span className="chamber__unsent-handle">{u.sender}</span>
                      <span className="chamber__unsent-body">{u.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <a href="/test-home" className="chamber__link">{t.testHome}</a>
          </>
        )}

        {tab === "model" && (
          <>
            <header className="chamber__header">
              <h1 className="chamber__title">{t.modelRoom}</h1>
              <p className="chamber__sync">
                {modelOffline ? t.modelOffline : t.modelLive}
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
                    ? t.modelAbsent
                    : t.askModel}
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
                placeholder={t.askModel}
                disabled={!sessionHandle || modelLoading}
                aria-label="model input"
              />
              <button
                type="submit"
                className="chamber__send"
                disabled={!sessionHandle || !modelDraft.trim() || modelLoading}
              >
                {modelLoading ? "..." : t.send}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
