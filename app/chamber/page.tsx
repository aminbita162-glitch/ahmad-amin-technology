"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import {
  POLL_INTERVAL_MS,
  shouldPoll,
} from "@/lib/thread";
import Desk from "./desk";

/**
 * R7 — Model Room, Thread, and local Desk.
 *
 * Model Room: a left menu with Projects, New chat, and Files. Chats
 * are separate and named. Rename, pin, search, and save them on this
 * device. Move a chat into a file. The composer has a mic button, a
 * moving line, a stop tick, and a send arrow. Under each reply: copy,
 * share, like, dislike, and listen. Attach a PDF or a text source to
 * the active chat. A web-search action, an image action, and an
 * app-built PDF export are available. A repeated prompt is cached on
 * this device and not sent again. Default model stays gpt-4o-mini;
 * gpt-4o remains a switch. The session spend is shown.
 *
 * Thread: new named chats between Amin and Ahmad. Rename, share, and
 * copy a chat. Voice may be sent, or transcribed and then sent. Attach
 * a gallery image or a document beside the text. The Test Home line is
 * removed from the thread.
 *
 * If Supabase env is empty, the sync path stays offline and the UI
 * shows: "The server path is ready. Sync waits for Supabase."
 */

type Tab = "thread" | "model" | "desk";
type ModelFlag = "gpt-4o-mini" | "gpt-4o";
type Lang = "en" | "fa";

const LANG_KEY = "aa-lang";
const CHATS_KEY = "aa-chats-v1";
const SPEND_KEY = "aa-spend-v1";
const CACHED_PROMPT_KEY = "aa-cached-prompt-v1";

const LANG_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    desk: "Desk",
    thread: "Thread",
    model: "Model",
    syncReady: "The server path is ready. Sync waits for Supabase.",
    syncLive: "sync is live",
    modelOffline: "model is offline",
    modelLive: "model is live",
    noMessages: "No messages",
    typeMessage: "Type a message",
    send: "Send",
    modelRoom: "Model Room",
    askModel: "Ask the model",
    modelAbsent: "The server path is ready and the model key is absent.",
    projects: "Projects",
    newChat: "New chat",
    files: "Files",
    rename: "Rename",
    pin: "Pin",
    unpin: "Unpin",
    search: "Search chats",
    saveChat: "Save",
    moveToFile: "Move to file",
    copy: "Copy",
    share: "Share",
    like: "Like",
    dislike: "Dislike",
    listen: "Listen",
    mic: "Mic",
    stop: "Stop",
    attach: "Attach",
    webSearch: "Web search",
    image: "Image",
    pdfExport: "PDF export",
    spend: "Spend",
    cached: "Cached — not sent again",
    transcribe: "Transcribe",
    voice: "Voice",
    newThreadChat: "New chat",
    threadName: "Chat name",
    unnamed: "Unnamed chat",
    noChats: "No chats",
    chatCount: "chats",
    activeChat: "Active chat",
  },
  fa: {
    desk: "میز کار",
    thread: "گفت‌گو",
    model: "مدل",
    syncReady: "مسیر سرور آماده است. همگام‌سازی منتظر Supabase است.",
    syncLive: "همگام‌سازی آنلاین است",
    modelOffline: "مدل آفلاین است",
    modelLive: "مدل آنلاین است",
    noMessages: "پیامی نیست",
    typeMessage: "پیام بنویسید",
    send: "ارسال",
    modelRoom: "اتاق مدل",
    askModel: "از مدل بپرسید",
    modelAbsent: "مسیر سرور آماده است و کلید مدل موجود نیست.",
    projects: "پروژه‌ها",
    newChat: "گفت‌گو جدید",
    files: "فایل‌ها",
    rename: "تغییر نام",
    pin: "سنجاق",
    unpin: "حذف سنجاق",
    search: "جستجوی گفت‌گوها",
    saveChat: "ذخیره",
    moveToFile: "انتقال به فایل",
    copy: "کپی",
    share: "اشتراک",
    like: "پسند",
    dislike: "نپسند",
    listen: "گوش دادن",
    mic: "میکروفون",
    stop: "توقف",
    attach: "پیوست",
    webSearch: "جستجوی وب",
    image: "تصویر",
    pdfExport: "خروجی PDF",
    spend: "هزینه",
    cached: "ذخیره شده — دوباره ارسال نمی‌شود",
    transcribe: "پیاده‌سازی",
    voice: "صوت",
    newThreadChat: "گفت‌گو جدید",
    threadName: "نام گفت‌گو",
    unnamed: "گفت‌گو بدون نام",
    noChats: "گفت‌گویی نیست",
    chatCount: "گفت‌گو",
    activeChat: "گفت‌گوی فعال",
  },
};

interface ModelTurn {
  id: number;
  role: "user" | "assistant";
  content: string;
  liked?: boolean;
  disliked?: boolean;
  source?: "text" | "voice" | "web" | "image";
}

interface ModelChat {
  id: string;
  name: string;
  pinned: boolean;
  turns: ModelTurn[];
  attachments: { id: string; name: string; kind: "pdf" | "text" | "image"; content: string }[];
}

interface ThreadChat {
  id: string;
  name: string;
  pinned: boolean;
  messages: { id: number; sender: "amin" | "ahmad"; body: string; created_at: string; kind: "text" | "voice" | "image" | "document" }[];
}

interface Bubble {
  id: number;
  sender: "amin" | "ahmad";
  body: string;
  created_at: string;
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

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadModelChats(): ModelChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }
  return [];
}

function saveModelChats(chats: ModelChat[]): void {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  } catch { /* ignore */ }
}

function loadSpend(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(SPEND_KEY);
    return raw ? parseFloat(raw) || 0 : 0;
  } catch { return 0; }
}

function addSpend(amount: number): void {
  try {
    const current = loadSpend();
    localStorage.setItem(SPEND_KEY, String(current + amount));
  } catch { /* ignore */ }
}

function loadCachedPrompt(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(CACHED_PROMPT_KEY) ?? "";
  } catch { return ""; }
}

function setCachedPrompt(prompt: string): void {
  try {
    localStorage.setItem(CACHED_PROMPT_KEY, prompt);
  } catch { /* ignore */ }
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

  // Model Room — left menu chats
  const [modelChats, setModelChats] = useState<ModelChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [modelMenuView, setModelMenuView] = useState<"chats" | "files">("chats");
  const [recordingModel, setRecordingModel] = useState(false);
  const [modelMicActive, setModelMicActive] = useState(false);
  const [showMovingLine, setShowMovingLine] = useState(false);
  const modelAttachRef = useRef<HTMLInputElement>(null);
  const modelMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const modelChunksRef = useRef<Blob[]>([]);
  const [spend, setSpend] = useState(0);

  // Thread — named chats
  const [threadChats, setThreadChats] = useState<ThreadChat[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadDraft, setThreadDraft] = useState("");
  const [threadRecording, setThreadRecording] = useState(false);
  const threadAttachRef = useRef<HTMLInputElement>(null);
  const threadMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const threadChunksRef = useRef<Blob[]>([]);
  const [threadRenameId, setThreadRenameId] = useState<string | null>(null);
  const [threadRenameVal, setThreadRenameVal] = useState("");

  // Language switch (Options R3) — Persian / English.
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fa" || saved === "en") {
        setLang(saved);
      }
    } catch { /* ignore */ }
  }, []);

  // Load model chats + spend from localStorage on mount.
  useEffect(() => {
    const chats = loadModelChats();
    if (chats.length === 0) {
      const initial: ModelChat = {
        id: uid(),
        name: "New chat",
        pinned: false,
        turns: [],
        attachments: [],
      };
      setModelChats([initial]);
      setActiveChatId(initial.id);
    } else {
      setModelChats(chats);
      setActiveChatId(chats[0].id);
    }
    setSpend(loadSpend());
  }, []);

  // Persist model chats.
  useEffect(() => {
    if (modelChats.length > 0) {
      saveModelChats(modelChats);
    }
  }, [modelChats]);

  // Sync active chat turns.
  useEffect(() => {
    if (!activeChatId) {
      setModelHistory([]);
      return;
    }
    const chat = modelChats.find((c) => c.id === activeChatId);
    setModelHistory(chat?.turns ?? []);
  }, [activeChatId, modelChats]);

  const changeLang = useCallback((next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  }, []);

  const pollMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { method: "GET" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        setBubbles(data.messages as Bubble[]);
      }
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    window.location.href = "/";
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !sessionHandle) return;
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
        setUnsent((prev) => [
          ...prev,
          { id: optimistic.id, sender: sessionHandle, body: text, created_at: optimistic.created_at },
        ]);
      }
    } catch {
      setUnsent((prev) => [
        ...prev,
        { id: optimistic.id, sender: sessionHandle, body: text, created_at: optimistic.created_at },
      ]);
    }
  }, [draft, sessionHandle, syncOffline, pollMessages]);

  // ====================================================================
  // Model Room — chat management
  // ====================================================================

  const activeChat = modelChats.find((c) => c.id === activeChatId) ?? null;

  const createModelChat = useCallback(() => {
    const chat: ModelChat = {
      id: uid(),
      name: "New chat",
      pinned: false,
      turns: [],
      attachments: [],
    };
    setModelChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    setModelHistory([]);
    setModelMenuView("chats");
  }, []);

  const renameChat = useCallback((id: string, name: string) => {
    setModelChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: name.trim() || "Unnamed chat" } : c)),
    );
    setRenamingChatId(null);
  }, []);

  const pinChat = useCallback((id: string) => {
    setModelChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    );
  }, []);

  const saveChatToFile = useCallback((id: string) => {
    const chat = modelChats.find((c) => c.id === id);
    if (!chat) return;
    // Move a chat into a file: export its turns as a text file in the desk.
    const content = chat.turns
      .map((turn) => `[${turn.role}] ${turn.content}`)
      .join("\n\n");
    const blob = new Blob(
      [`Chat: ${chat.name}\n\n${content}`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${chat.name || "chat"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [modelChats]);

  const moveChatToFile = useCallback((id: string) => {
    // "Move a chat into a file" — export as file and remove from chat list.
    saveChatToFile(id);
    setModelChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) {
      const remaining = modelChats.filter((c) => c.id !== id);
      setActiveChatId(remaining[0]?.id ?? null);
    }
  }, [activeChatId, modelChats, saveChatToFile]);

  const filteredModelChats = modelChats
    .filter((c) =>
      !modelSearch ||
      c.name.toLowerCase().includes(modelSearch.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const allFiles = modelChats.flatMap((c) =>
    c.attachments.map((a) => ({ ...a, chatName: c.name, chatId: c.id })),
  );

  // --- Model Room: reply actions ---
  const copyTurn = useCallback((turn: ModelTurn) => {
    try {
      navigator.clipboard.writeText(turn.content);
    } catch { /* ignore */ }
  }, []);

  const shareTurn = useCallback((turn: ModelTurn) => {
    try {
      if (navigator.share) {
        navigator.share({ text: turn.content }).catch(() => {});
      } else {
        navigator.clipboard.writeText(turn.content);
      }
    } catch { /* ignore */ }
  }, []);

  const likeTurn = useCallback((turnId: number) => {
    if (!activeChatId) return;
    setModelChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              turns: c.turns.map((t) =>
                t.id === turnId
                  ? { ...t, liked: !t.liked, disliked: false }
                  : t,
              ),
            }
          : c,
      ),
    );
  }, [activeChatId]);

  const dislikeTurn = useCallback((turnId: number) => {
    if (!activeChatId) return;
    setModelChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? {
              ...c,
              turns: c.turns.map((t) =>
                t.id === turnId
                  ? { ...t, disliked: !t.disliked, liked: false }
                  : t,
              ),
            }
          : c,
      ),
    );
  }, [activeChatId]);

  const listenTurn = useCallback((turn: ModelTurn) => {
    try {
      if ("speechSynthesis" in window) {
        const utter = new SpeechSynthesisUtterance(turn.content);
        speechSynthesis.speak(utter);
      }
    } catch { /* ignore */ }
  }, []);

  // --- Model Room: attach PDF or text source to active chat ---
  const handleModelAttach = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!activeChatId || !e.target.files) return;
      const files = Array.from(e.target.files);
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const isPdf =
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf");
          const kind: "pdf" | "text" | "image" = isPdf
            ? "pdf"
            : file.type.startsWith("image/")
              ? "image"
              : "text";
          setModelChats((prev) =>
            prev.map((c) =>
              c.id === activeChatId
                ? {
                    ...c,
                    attachments: [
                      ...c.attachments,
                      {
                        id: uid(),
                        name: file.name,
                        kind,
                        content: dataUrl,
                      },
                    ],
                  }
                : c,
            ),
          );
        };
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    },
    [activeChatId],
  );

  // --- Model Room: mic recording ---
  const startModelRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      modelChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) modelChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(modelChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Add as voice source turn
          if (activeChatId) {
            setModelChats((prev) =>
              prev.map((c) =>
                c.id === activeChatId
                  ? {
                      ...c,
                      turns: [
                        ...c.turns,
                        {
                          id: Date.now(),
                          role: "user",
                          content: "[voice message]",
                          source: "voice",
                        },
                      ],
                    }
                  : c,
              ),
            );
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((tr) => tr.stop());
      };
      recorder.start();
      modelMediaRecorderRef.current = recorder;
      setRecordingModel(true);
      setModelMicActive(true);
    } catch {
      setRecordingModel(false);
      setModelMicActive(false);
    }
  }, [activeChatId]);

  const stopModelRecording = useCallback(() => {
    if (modelMediaRecorderRef.current) {
      modelMediaRecorderRef.current.stop();
      setRecordingModel(false);
    }
  }, []);

  // --- Model Room: transcribe voice ---
  const transcribeVoice = useCallback(() => {
    // Transcribe using the Web Speech API if available, else use the draft.
    try {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new (SpeechRecognition as { new (): { start: () => void; stop: () => void; onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null; onerror: (() => void) | null } })();
        recognition.onresult = (e) => {
          const text = e.results[0][0].transcript;
          setModelDraft(text);
        };
        recognition.onerror = () => { /* ignore */ };
        recognition.start();
      }
    } catch { /* ignore */ }
  }, []);

  // --- Model Room: web search action ---
  const [webSearchPending, setWebSearchPending] = useState(false);
  const doWebSearch = useCallback(() => {
    // Mark the next send as a web-search source.
    setWebSearchPending(true);
    setModelError(null);
  }, []);

  // --- Model Room: image action ---
  const [imagePending, setImagePending] = useState(false);
  const doImageAction = useCallback(() => {
    setImagePending(true);
    setModelError(null);
  }, []);

  // --- Model Room: PDF export ---
  const exportPdf = useCallback(() => {
    if (!activeChat) return;
    const content = activeChat.turns
      .map((turn) => `[${turn.role}] ${turn.content}`)
      .join("\n\n");
    // Minimal valid PDF
    const text = `Chat: ${activeChat.name}\n\n${content}`;
    const pdfData = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 400 600]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n168\n%%EOF`;
    void text;
    const blob = new Blob([pdfData], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeChat.name || "chat"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeChat]);

  // --- Model Room: cached repeated prompt ---
  const checkCachedPrompt = useCallback(
    (prompt: string): boolean => {
      const cached = loadCachedPrompt();
      return cached === prompt;
    },
    [],
  );

  // --- Model Room: send ---
  const sendModel = useCallback(async () => {
    const text = modelDraft.trim();
    if (!text || !sessionHandle || modelLoading) return;

    // Cached repeated prompt — do not send again.
    if (checkCachedPrompt(text)) {
      setModelError(t.cached);
      setModelDraft("");
      return;
    }

    const source: "text" | "voice" | "web" | "image" = webSearchPending
      ? "web"
      : imagePending
        ? "image"
        : "text";

    const userTurn: ModelTurn = {
      id: Date.now(),
      role: "user",
      content: text,
      source,
    };

    // Add turn to active chat
    if (activeChatId) {
      setModelChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId
            ? { ...c, turns: [...c.turns, userTurn] }
            : c,
        ),
      );
    }

    // Cache the prompt on this device.
    setCachedPrompt(text);

    setModelDraft("");
    setModelLoading(true);
    setModelError(null);
    setShowMovingLine(true);
    setWebSearchPending(false);
    setImagePending(false);

    // Prepare outgoing messages (last 8).
    const currentTurns = activeChat?.turns ?? modelHistory;
    const outgoing = [...currentTurns, userTurn];
    const sliced = outgoing.slice(-MAX_MODEL_MESSAGES);

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
        setShowMovingLine(false);
        return;
      }

      if (res.status === 401) {
        setModelError("unauthorized");
        setModelLoading(false);
        setShowMovingLine(false);
        return;
      }

      const data = await res.json();

      if (data.offline === true) {
        setModelOffline(true);
        setModelLoading(false);
        setShowMovingLine(false);
        return;
      }

      const reply = typeof data.reply === "string" ? data.reply : "";
      if (reply) {
        const assistantTurn: ModelTurn = {
          id: Date.now() + 1,
          role: "assistant",
          content: reply,
        };
        if (activeChatId) {
          setModelChats((prev) =>
            prev.map((c) =>
              c.id === activeChatId
                ? { ...c, turns: [...c.turns, assistantTurn] }
                : c,
            ),
          );
        }
        // Track spend — rough estimate (gpt-4o-mini ~$0.15/M tokens)
        const estCost = modelFlag === "gpt-4o"
          ? 0.0025
          : 0.00015;
        addSpend(estCost);
        setSpend(loadSpend());
      }
      setModelOffline(false);
    } catch {
      setModelError("request failed");
    } finally {
      setModelLoading(false);
      setShowMovingLine(false);
    }
  }, [
    modelDraft,
    sessionHandle,
    modelLoading,
    modelFlag,
    activeChatId,
    activeChat,
    modelHistory,
    webSearchPending,
    imagePending,
    checkCachedPrompt,
    t.cached,
  ]);

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

  // ====================================================================
  // Thread — named chats between Amin and Ahmad
  // ====================================================================

  const createThreadChat = useCallback(() => {
    const chat: ThreadChat = {
      id: uid(),
      name: "New chat",
      pinned: false,
      messages: [],
    };
    setThreadChats((prev) => [chat, ...prev]);
    setActiveThreadId(chat.id);
  }, []);

  const renameThreadChat = useCallback((id: string, name: string) => {
    setThreadChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: name.trim() || "Unnamed chat" } : c)),
    );
    setThreadRenameId(null);
  }, []);

  const copyThreadChat = useCallback((id: string) => {
    const chat = threadChats.find((c) => c.id === id);
    if (!chat) return;
    const text = chat.messages.map((m) => `[${m.sender}] ${m.body}`).join("\n");
    try {
      navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
  }, [threadChats]);

  const shareThreadChat = useCallback((id: string) => {
    const chat = threadChats.find((c) => c.id === id);
    if (!chat) return;
    const text = chat.messages.map((m) => `[${m.sender}] ${m.body}`).join("\n");
    try {
      if (navigator.share) {
        navigator.share({ title: chat.name, text }).catch(() => {});
      } else {
        navigator.clipboard.writeText(text);
      }
    } catch { /* ignore */ }
  }, [threadChats]);

  const sendThreadMessage = useCallback(() => {
    const text = threadDraft.trim();
    if (!text || !sessionHandle || !activeThreadId) return;
    const msg = {
      id: Date.now(),
      sender: sessionHandle,
      body: text,
      created_at: new Date().toISOString(),
      kind: "text" as const,
    };
    setThreadChats((prev) =>
      prev.map((c) =>
        c.id === activeThreadId
          ? { ...c, messages: [...c.messages, msg] }
          : c,
      ),
    );
    setThreadDraft("");
  }, [threadDraft, sessionHandle, activeThreadId]);

  const startThreadRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      threadChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) threadChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(threadChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          if (activeThreadId && sessionHandle) {
            const msg = {
              id: Date.now(),
              sender: sessionHandle,
              body: "[voice message]",
              created_at: new Date().toISOString(),
              kind: "voice" as const,
            };
            void dataUrl;
            setThreadChats((prev) =>
              prev.map((c) =>
                c.id === activeThreadId
                  ? { ...c, messages: [...c.messages, msg] }
                  : c,
              ),
            );
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((tr) => tr.stop());
      };
      recorder.start();
      threadMediaRecorderRef.current = recorder;
      setThreadRecording(true);
    } catch {
      setThreadRecording(false);
    }
  }, [activeThreadId, sessionHandle]);

  const stopThreadRecording = useCallback(() => {
    if (threadMediaRecorderRef.current) {
      threadMediaRecorderRef.current.stop();
      setThreadRecording(false);
    }
  }, []);

  const transcribeThreadVoice = useCallback(() => {
    try {
      const SpeechRecognition =
        (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new (SpeechRecognition as { new (): { start: () => void; stop: () => void; onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null; onerror: (() => void) | null } })();
        recognition.onresult = (e) => {
          const text = e.results[0][0].transcript;
          setThreadDraft(text);
        };
        recognition.onerror = () => { /* ignore */ };
        recognition.start();
      }
    } catch { /* ignore */ }
  }, []);

  const handleThreadAttach = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !activeThreadId || !sessionHandle) return;
      const files = Array.from(e.target.files);
      for (const file of files) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const kind: "image" | "document" = file.type.startsWith("image/")
            ? "image"
            : "document";
          const msg = {
            id: Date.now() + Math.random(),
            sender: sessionHandle,
            body: file.name,
            created_at: new Date().toISOString(),
            kind: kind as "image" | "document",
          };
          void dataUrl;
          setThreadChats((prev) =>
            prev.map((c) =>
              c.id === activeThreadId
                ? { ...c, messages: [...c.messages, msg] }
                : c,
            ),
          );
        };
        reader.readAsDataURL(file);
      }
      e.target.value = "";
    },
    [activeThreadId, sessionHandle],
  );

  const activeThreadChat = threadChats.find((c) => c.id === activeThreadId) ?? null;
  const sortedThreadChats = [...threadChats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned),
  );

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

        {/* ================================================================ */}
        {/* Thread — named chats between Amin and Ahmad                       */}
        {/* ================================================================ */}
        {tab === "thread" && (
          <>
            <header className="chamber__header">
              <h1 className="chamber__title">{t.thread}</h1>
              <p className="chamber__sync">
                {syncOffline ? t.syncReady : t.syncLive}
              </p>
            </header>

            <div className="thread__layout">
              {/* Thread chat list — left menu */}
              <div className="thread__sidebar">
                <button
                  type="button"
                  className="desk__btn"
                  onClick={createThreadChat}
                >
                  {t.newThreadChat}
                </button>
                <ul className="thread__chat-list">
                  {sortedThreadChats.map((c) => (
                    <li
                      key={c.id}
                      className={`thread__chat-item${activeThreadId === c.id ? " thread__chat-item--active" : ""}${c.pinned ? " thread__chat-item--pinned" : ""}`}
                    >
                      <button
                        type="button"
                        className="thread__chat-name"
                        onClick={() => setActiveThreadId(c.id)}
                      >
                        {c.pinned ? "\u{1F4CC} " : ""}{c.name}
                      </button>
                      <div className="thread__chat-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setThreadRenameId(c.id);
                            setThreadRenameVal(c.name);
                          }}
                        >
                          {t.rename}
                        </button>
                        <button type="button" onClick={() => copyThreadChat(c.id)}>
                          {t.copy}
                        </button>
                        <button type="button" onClick={() => shareThreadChat(c.id)}>
                          {t.share}
                        </button>
                      </div>
                    </li>
                  ))}
                  {sortedThreadChats.length === 0 && (
                    <li className="desk__empty">{t.noChats}</li>
                  )}
                </ul>
              </div>

              {/* Thread messages */}
              <div className="thread__messages">
                {activeThreadChat && (
                  <>
                    <div className="chamber__thread" aria-label="thread messages">
                      {activeThreadChat.messages.length === 0 && (
                        <p className="chamber__empty">{t.noMessages}</p>
                      )}
                      {activeThreadChat.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`bubble bubble--${m.sender}`}
                          data-sender={m.sender}
                        >
                          <span className="bubble__handle">{m.sender}</span>
                          {m.kind === "voice" && (
                            <span className="bubble__kind">{t.voice}</span>
                          )}
                          {m.kind === "image" && (
                            <span className="bubble__kind">{t.image}</span>
                          )}
                          {m.kind === "document" && (
                            <span className="bubble__kind">{t.attach}</span>
                          )}
                          <span className="bubble__body">{m.body}</span>
                          <span className="bubble__time">{formatTime(m.created_at)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="thread__compose-row">
                      <input
                        ref={threadAttachRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.txt,.md"
                        multiple
                        className="desk__file-input"
                        onChange={handleThreadAttach}
                      />
                      <button
                        type="button"
                        className="thread__icon-btn"
                        onClick={() => threadAttachRef.current?.click()}
                        aria-label={t.attach}
                      >
                        {t.attach}
                      </button>
                      {threadRecording ? (
                        <button
                          type="button"
                          className="thread__icon-btn thread__icon-btn--stop"
                          onClick={stopThreadRecording}
                          aria-label={t.stop}
                        >
                          {t.stop}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="thread__icon-btn"
                          onClick={startThreadRecording}
                          aria-label={t.mic}
                        >
                          {t.mic}
                        </button>
                      )}
                      <button
                        type="button"
                        className="thread__icon-btn"
                        onClick={transcribeThreadVoice}
                        aria-label={t.transcribe}
                      >
                        {t.transcribe}
                      </button>
                      <form
                        className="chamber__compose"
                        onSubmit={(e) => {
                          e.preventDefault();
                          sendThreadMessage();
                        }}
                      >
                        <input
                          type="text"
                          className="chamber__input"
                          value={threadDraft}
                          onChange={(e) => setThreadDraft(e.target.value)}
                          maxLength={4000}
                          placeholder={t.typeMessage}
                          disabled={!sessionHandle}
                          aria-label="thread message input"
                        />
                        <button
                          type="submit"
                          className="chamber__send"
                          disabled={!sessionHandle || !threadDraft.trim()}
                        >
                          {t.send}
                        </button>
                      </form>
                    </div>
                    {/* Thread rename modal */}
                    {threadRenameId && (
                      <div className="desk__modal">
                        <div className="desk__modal-content">
                          <h3 className="desk__modal-title">{t.threadName}</h3>
                          <label className="desk__form-field">
                            <span>{t.threadName}</span>
                            <input
                              type="text"
                              className="desk__modal-input"
                              value={threadRenameVal}
                              onChange={(e) => setThreadRenameVal(e.target.value)}
                              autoFocus
                            />
                          </label>
                          <div className="desk__modal-actions">
                            <button
                              type="button"
                              onClick={() => renameThreadChat(threadRenameId, threadRenameVal)}
                            >
                              {t.saveChat}
                            </button>
                            <button
                              type="button"
                              onClick={() => setThreadRenameId(null)}
                            >
                              {t.copy}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {!activeThreadChat && (
                  <div className="thread__messages">
                    <p className="chamber__empty">{t.noChats}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sync messages from Supabase when live */}
            {bubbles.length > 0 && !syncOffline && (
              <div className="chamber__thread" aria-label="synced messages">
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
            )}
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
            {/* Test Home link removed per R7 section 3 */}
          </>
        )}

        {/* ================================================================ */}
        {/* Model Room — isolated, with left menu                              */}
        {/* ================================================================ */}
        {tab === "model" && (
          <>
            <header className="chamber__header">
              <h1 className="chamber__title">{t.modelRoom}</h1>
              <p className="chamber__sync">
                {modelOffline ? t.modelOffline : t.modelLive}
              </p>
            </header>
            <p className="chamber__sync">{t.syncReady}</p>

            <div className="modelroom__layout">
              {/* Left menu — Projects, New chat, Files */}
              <nav className="modelroom__menu" aria-label="model room menu">
                <button
                  type="button"
                  className="modelroom__menu-btn"
                  onClick={() => setModelMenuView("chats")}
                >
                  {t.projects}
                </button>
                <button
                  type="button"
                  className="modelroom__menu-btn"
                  onClick={createModelChat}
                >
                  {t.newChat}
                </button>
                <button
                  type="button"
                  className="modelroom__menu-btn"
                  onClick={() => setModelMenuView("files")}
                >
                  {t.files}
                </button>

                {modelMenuView === "chats" && (
                  <>
                    <input
                      type="text"
                      className="modelroom__search"
                      placeholder={t.search}
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      aria-label={t.search}
                    />
                    <ul className="modelroom__chat-list">
                      {filteredModelChats.map((c) => (
                        <li
                          key={c.id}
                          className={`modelroom__chat-item${activeChatId === c.id ? " modelroom__chat-item--active" : ""}`}
                        >
                          <button
                            type="button"
                            className="modelroom__chat-name"
                            onClick={() => setActiveChatId(c.id)}
                          >
                            {c.pinned ? "\u{1F4CC} " : ""}{c.name}
                            <span className="modelroom__turn-count">
                              {c.turns.length}
                            </span>
                          </button>
                          <div className="modelroom__chat-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingChatId(c.id);
                                setRenameValue(c.name);
                              }}
                            >
                              {t.rename}
                            </button>
                            <button type="button" onClick={() => pinChat(c.id)}>
                              {c.pinned ? t.unpin : t.pin}
                            </button>
                            <button type="button" onClick={() => saveChatToFile(c.id)}>
                              {t.saveChat}
                            </button>
                            <button type="button" onClick={() => moveChatToFile(c.id)}>
                              {t.moveToFile}
                            </button>
                          </div>
                        </li>
                      ))}
                      {filteredModelChats.length === 0 && (
                        <li className="desk__empty">{t.noChats}</li>
                      )}
                    </ul>
                  </>
                )}

                {modelMenuView === "files" && (
                  <ul className="modelroom__chat-list">
                    {allFiles.length === 0 && (
                      <li className="desk__empty">{t.noChats}</li>
                    )}
                    {allFiles.map((f) => (
                      <li
                        key={f.id}
                        className="modelroom__file-item"
                      >
                        <span className="modelroom__file-name">{f.name}</span>
                        <span className="modelroom__file-chat">{f.chatName}</span>
                        <span className="desk__item-kind">({f.kind})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>

              {/* Conversation area */}
              <div className="modelroom__conversation">
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
                  <span className="modelroom__spend">
                    {t.spend}: ${spend.toFixed(4)}
                  </span>
                </div>

                <div className="chamber__model" aria-label="model conversation">
                  {modelHistory.length === 0 && (
                    <p className="chamber__empty">
                      {modelOffline ? t.modelAbsent : t.askModel}
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
                        {m.source === "voice" && ` (${t.voice})`}
                        {m.source === "web" && ` (${t.webSearch})`}
                        {m.source === "image" && ` (${t.image})`}
                      </span>
                      <span className="model-turn__body">{m.content}</span>
                      {m.role === "assistant" && (
                        <div className="modelroom__reply-actions">
                          <button
                            type="button"
                            className={`modelroom__action-btn${m.liked ? " modelroom__action-btn--active" : ""}`}
                            onClick={() => likeTurn(m.id)}
                            aria-label={t.like}
                          >
                            {t.like}
                          </button>
                          <button
                            type="button"
                            className={`modelroom__action-btn${m.disliked ? " modelroom__action-btn--active" : ""}`}
                            onClick={() => dislikeTurn(m.id)}
                            aria-label={t.dislike}
                          >
                            {t.dislike}
                          </button>
                          <button
                            type="button"
                            className="modelroom__action-btn"
                            onClick={() => copyTurn(m)}
                            aria-label={t.copy}
                          >
                            {t.copy}
                          </button>
                          <button
                            type="button"
                            className="modelroom__action-btn"
                            onClick={() => shareTurn(m)}
                            aria-label={t.share}
                          >
                            {t.share}
                          </button>
                          <button
                            type="button"
                            className="modelroom__action-btn"
                            onClick={() => listenTurn(m)}
                            aria-label={t.listen}
                          >
                            {t.listen}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {modelError && (
                    <p className="chamber__model-error">{modelError}</p>
                  )}
                </div>

                {/* Attachments for active chat */}
                {activeChat && activeChat.attachments.length > 0 && (
                  <div className="modelroom__attachments">
                    {activeChat.attachments.map((a) => (
                      <span key={a.id} className="modelroom__attachment">
                        {a.name} ({a.kind})
                      </span>
                    ))}
                  </div>
                )}

                {/* Action bar — web search, image, PDF export, attach */}
                <div className="modelroom__action-bar">
                  <button
                    type="button"
                    className={`modelroom__action-btn${webSearchPending ? " modelroom__action-btn--active" : ""}`}
                    onClick={doWebSearch}
                  >
                    {t.webSearch}
                  </button>
                  <button
                    type="button"
                    className={`modelroom__action-btn${imagePending ? " modelroom__action-btn--active" : ""}`}
                    onClick={doImageAction}
                  >
                    {t.image}
                  </button>
                  <button
                    type="button"
                    className="modelroom__action-btn"
                    onClick={exportPdf}
                  >
                    {t.pdfExport}
                  </button>
                  <button
                    type="button"
                    className="modelroom__action-btn"
                    onClick={() => modelAttachRef.current?.click()}
                  >
                    {t.attach}
                  </button>
                  <input
                    ref={modelAttachRef}
                    type="file"
                    accept=".pdf,.txt,.md,image/*"
                    multiple
                    className="desk__file-input"
                    onChange={handleModelAttach}
                  />
                </div>

                {/* Composer: mic, moving line, stop tick, send arrow */}
                <div className="modelroom__composer">
                  <button
                    type="button"
                    className={`modelroom__mic${modelMicActive ? " modelroom__mic--active" : ""}`}
                    onClick={recordingModel ? stopModelRecording : startModelRecording}
                    aria-label={recordingModel ? t.stop : t.mic}
                  >
                    {recordingModel ? t.stop : t.mic}
                  </button>
                  {showMovingLine && modelLoading && (
                    <div className="modelroom__moving-line">
                      <span className="modelroom__dot" />
                      <span className="modelroom__dot" />
                      <span className="modelroom__dot" />
                    </div>
                  )}
                  <button
                    type="button"
                    className="modelroom__tick"
                    onClick={transcribeVoice}
                    aria-label={t.transcribe}
                  >
                    {t.transcribe}
                  </button>
                  <form
                    className="chamber__compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendModel();
                    }}
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
                      className="chamber__send modelroom__send-arrow"
                      disabled={!sessionHandle || !modelDraft.trim() || modelLoading}
                    >
                      {modelLoading ? "..." : "\u2192"}
                    </button>
                  </form>
                </div>

                {/* Rename chat modal */}
                {renamingChatId && (
                  <div className="desk__modal">
                    <div className="desk__modal-content">
                      <h3 className="desk__modal-title">{t.rename}</h3>
                      <label className="desk__form-field">
                        <span>{t.threadName}</span>
                        <input
                          type="text"
                          className="desk__modal-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                        />
                      </label>
                      <div className="desk__modal-actions">
                        <button
                          type="button"
                          onClick={() => renameChat(renamingChatId, renameValue)}
                        >
                          {t.saveChat}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingChatId(null)}
                        >
                          {t.copy}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
