"use client";

import { useEffect, useRef, useState } from "react";

/* ====================================================================== */
/* Types                                                                  */
/* ====================================================================== */

type ModelFlag = "gpt-4o-mini" | "gpt-4o";
type Tag = "contract" | "meeting" | "document" | "urgent";

interface Folder {
  id: string;
  name: string;
  pinned: boolean;
  tags: Tag[];
}

interface FileItem {
  id: string;
  name: string;
  kind: "text" | "pdf" | "document" | "voice";
  content: string;
  mimeType: string;
  folderId: string | null;
  pinned: boolean;
  tags: Tag[];
}

interface Meeting {
  id: string;
  title: string;
  date: string;
  done: boolean;
  tags: Tag[];
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}

interface Checklist {
  id: string;
  title: string;
  folderId: string | null;
  pinned: boolean;
  tags: Tag[];
  items: ChecklistItem[];
}

interface DeskData {
  folders: Folder[];
  files: FileItem[];
  meetings: Meeting[];
  checklists: Checklist[];
}

interface DeskProps {
  modelFlag: ModelFlag;
  setModelFlag: (flag: ModelFlag) => void;
  syncOffline: boolean;
  modelOffline: boolean;
  onLogout: () => void;
}

const STORAGE_KEY = "aa-desk-v1";
const ALL_TAGS: Tag[] = ["contract", "meeting", "document", "urgent"];

/* ====================================================================== */
/* Helpers (module level — no state)                                      */
/* ====================================================================== */

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadDesk(): DeskData {
  if (typeof window === "undefined") {
    return { folders: [], files: [], meetings: [], checklists: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { folders: [], files: [], meetings: [], checklists: [] };
    const parsed = JSON.parse(raw) as DeskData;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      files: Array.isArray(parsed.files) ? parsed.files : [],
      meetings: Array.isArray(parsed.meetings) ? parsed.meetings : [],
      checklists: Array.isArray(parsed.checklists) ? parsed.checklists : [],
    };
  } catch {
    return { folders: [], files: [], meetings: [], checklists: [] };
  }
}

function saveDesk(data: DeskData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function toggleTagArray(tags: Tag[], tag: Tag): Tag[] {
  return tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportFile(item: FileItem): void {
  if (item.kind === "text") {
    const blob = new Blob([item.content], { type: "text/plain" });
    downloadBlob(blob, item.name || "export.txt");
    return;
  }
  const commaIdx = item.content.indexOf(",");
  if (commaIdx < 0) return;
  const meta = item.content.slice(0, commaIdx);
  const b64 = item.content.slice(commaIdx + 1);
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : item.mimeType;
  try {
    const byteString = atob(b64);
    const array = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      array[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([array], { type: mime });
    downloadBlob(blob, item.name || "export");
  } catch {
    // base64 decode failed — skip
  }
}

function exportFolder(folder: Folder): void {
  const blob = new Blob([JSON.stringify(folder, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `${folder.name}.json`);
}

function openPdf(content: string): void {
  const commaIdx = content.indexOf(",");
  if (commaIdx < 0) return;
  const meta = content.slice(0, commaIdx);
  const b64 = content.slice(commaIdx + 1);
  const mimeMatch = meta.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
  try {
    const byteString = atob(b64);
    const array = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      array[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([array], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    // decode failed — skip
  }
}

function playVoice(content: string): void {
  try {
    const audio = new Audio(content);
    audio.play().catch(() => {});
  } catch {
    // playback failed — skip
  }
}

function dueLabel(date: string): { text: string; cls: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date + "T00:00:00");
  const diff = Math.round(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return { text: "overdue", cls: "desk__badge--overdue" };
  if (diff === 0) return { text: "due today", cls: "desk__badge--due" };
  if (diff <= 7) return { text: `due in ${diff}d`, cls: "desk__badge--soon" };
  return { text: `due in ${diff}d`, cls: "desk__badge" };
}

/* ====================================================================== */
/* Sub-components                                                         */
/* ====================================================================== */

function DueBadge({ date, done }: { date: string; done: boolean }) {
  if (done) return <span className="desk__badge desk__badge--done">done</span>;
  const d = dueLabel(date);
  if (!d) return null;
  return <span className={`desk__badge ${d.cls}`}>{d.text}</span>;
}

function MonthCalendar({ meetings }: { meetings: Meeting[] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div className="desk__calendar" aria-label="month calendar">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="desk__calendar-dow">{d}</div>
      ))}
      {cells.map((day, i) => (
        <div
          key={i}
          className={`desk__calendar-day${day ? "" : " desk__calendar-day--empty"}`}
        >
          {day && (
            <>
              <span className="desk__calendar-daynum">{day}</span>
              {meetings
                .filter((m) => m.date === dateStr(day))
                .map((m) => (
                  <span
                    key={m.id}
                    className={`desk__calendar-event${m.done ? " desk__calendar-event--done" : ""}`}
                  >
                    {m.title}
                  </span>
                ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function ContractForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (f: {
    date: string;
    parties: string;
    subject: string;
    terms: string;
    signature: string;
  }) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [parties, setParties] = useState("");
  const [subject, setSubject] = useState("");
  const [terms, setTerms] = useState("");
  const [signature, setSignature] = useState("");

  return (
    <div className="desk__modal">
      <div className="desk__modal-content">
        <h3 className="desk__modal-title">Contract Note Template</h3>
        <form
          className="desk__contract-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ date, parties, subject, terms, signature });
          }}
        >
          <label className="desk__form-field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="desk__form-field">
            <span>Parties</span>
            <input
              type="text"
              value={parties}
              onChange={(e) => setParties(e.target.value)}
              required
            />
          </label>
          <label className="desk__form-field">
            <span>Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </label>
          <label className="desk__form-field">
            <span>Terms</span>
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              required
            />
          </label>
          <label className="desk__form-field">
            <span>Signature</span>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              required
            />
          </label>
          <div className="desk__modal-actions">
            <button type="submit">Create</button>
            <button type="button" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ====================================================================== */
/* Desk — 25 local controls                                               */
/* ====================================================================== */

export default function Desk({
  modelFlag,
  setModelFlag,
  syncOffline,
  modelOffline,
  onLogout,
}: DeskProps) {
  const [data, setData] = useState<DeskData>({
    folders: [],
    files: [],
    meetings: [],
    checklists: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [previewingFileId, setPreviewingFileId] = useState<string | null>(null);
  const [moveFileId, setMoveFileId] = useState<string | null>(null);
  const [showContractForm, setShowContractForm] = useState(false);
  const [recording, setRecording] = useState(false);
  const [tagFilter, setTagFilter] = useState<Tag | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setData(loadDesk());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveDesk(data);
  }, [data, loaded]);

  /* Folder actions (control 1, 23, 12, 13, 10) */
  const createFolder = () => {
    const folder: Folder = {
      id: uid(),
      name: "New Folder",
      pinned: false,
      tags: [],
    };
    setData((d) => ({ ...d, folders: [...d.folders, folder] }));
  };

  const renameFolder = (id: string, name: string) => {
    setData((d) => ({
      ...d,
      folders: d.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
  };

  const deleteFolder = (id: string) => {
    setData((d) => ({
      ...d,
      folders: d.folders.filter((f) => f.id !== id),
      files: d.files.map((f) =>
        f.folderId === id ? { ...f, folderId: null } : f,
      ),
      checklists: d.checklists.map((c) =>
        c.folderId === id ? { ...c, folderId: null } : c,
      ),
    }));
    if (selectedFolderId === id) setSelectedFolderId(null);
  };

  const duplicateFolder = (id: string) => {
    setData((d) => {
      const folder = d.folders.find((f) => f.id === id);
      if (!folder) return d;
      const copy: Folder = {
        ...folder,
        id: uid(),
        name: `${folder.name} (copy)`,
        pinned: false,
      };
      return { ...d, folders: [...d.folders, copy] };
    });
  };

  /* File actions (control 2, 3, 4, 23, 24, 12, 13, 25) */
  const createTextFile = () => {
    const file: FileItem = {
      id: uid(),
      name: "New Text.txt",
      kind: "text",
      content: "",
      mimeType: "text/plain",
      folderId: selectedFolderId,
      pinned: false,
      tags: [],
    };
    setData((d) => ({ ...d, files: [...d.files, file] }));
    setEditingFileId(file.id);
  };

  const updateFile = (id: string, patch: Partial<FileItem>) => {
    setData((d) => ({
      ...d,
      files: d.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  };

  const deleteFile = (id: string) => {
    setData((d) => ({ ...d, files: d.files.filter((f) => f.id !== id) }));
    if (editingFileId === id) setEditingFileId(null);
    if (previewingFileId === id) setPreviewingFileId(null);
  };

  const duplicateFile = (id: string) => {
    setData((d) => {
      const file = d.files.find((f) => f.id === id);
      if (!file) return d;
      const copy: FileItem = {
        ...file,
        id: uid(),
        name: `${file.name} (copy)`,
        pinned: false,
      };
      return { ...d, files: [...d.files, copy] };
    });
  };

  const moveFile = (fileId: string, targetFolderId: string | null) => {
    setData((d) => ({
      ...d,
      files: d.files.map((f) =>
        f.id === fileId ? { ...f, folderId: targetFolderId } : f,
      ),
    }));
    setMoveFileId(null);
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "pdf" | "document",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const item: FileItem = {
        id: uid(),
        name: file.name,
        kind,
        content: dataUrl,
        mimeType: file.type || "application/octet-stream",
        folderId: selectedFolderId,
        pinned: false,
        tags: [],
      };
      setData((d) => ({ ...d, files: [...d.files, item] }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /* Voice recording (control 5) */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const item: FileItem = {
            id: uid(),
            name: `Voice ${new Date().toLocaleString("en")}`,
            kind: "voice",
            content: dataUrl,
            mimeType: "audio/webm",
            folderId: selectedFolderId,
            pinned: false,
            tags: [],
          };
          setData((d) => ({ ...d, files: [...d.files, item] }));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  /* Meeting actions (control 6, 7, 8, 22, 10) */
  const addMeeting = (title: string, date: string) => {
    const meeting: Meeting = {
      id: uid(),
      title,
      date,
      done: false,
      tags: [],
    };
    setData((d) => ({ ...d, meetings: [...d.meetings, meeting] }));
  };

  const toggleMeetingDone = (id: string) => {
    setData((d) => ({
      ...d,
      meetings: d.meetings.map((m) =>
        m.id === id ? { ...m, done: !m.done } : m,
      ),
    }));
  };

  const deleteMeeting = (id: string) => {
    setData((d) => ({
      ...d,
      meetings: d.meetings.filter((m) => m.id !== id),
    }));
  };

  /* Checklist actions (control 9) */
  const createChecklist = () => {
    const checklist: Checklist = {
      id: uid(),
      title: "New Checklist",
      folderId: selectedFolderId,
      pinned: false,
      tags: [],
      items: [],
    };
    setData((d) => ({ ...d, checklists: [...d.checklists, checklist] }));
  };

  const addChecklistItem = (checklistId: string, text: string) => {
    setData((d) => ({
      ...d,
      checklists: d.checklists.map((c) =>
        c.id === checklistId
          ? {
              ...c,
              items: [
                ...c.items,
                { id: uid(), text, done: false, order: c.items.length },
              ],
            }
          : c,
      ),
    }));
  };

  const toggleChecklistItem = (checklistId: string, itemId: string) => {
    setData((d) => ({
      ...d,
      checklists: d.checklists.map((c) =>
        c.id === checklistId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === itemId ? { ...i, done: !i.done } : i,
              ),
            }
          : c,
      ),
    }));
  };

  const moveChecklistItem = (
    checklistId: string,
    itemId: string,
    dir: "up" | "down",
  ) => {
    setData((d) => ({
      ...d,
      checklists: d.checklists.map((c) => {
        if (c.id !== checklistId) return c;
        const items = [...c.items].sort((a, b) => a.order - b.order);
        const idx = items.findIndex((i) => i.id === itemId);
        if (idx < 0) return c;
        const swapIdx = dir === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= items.length) return c;
        const tmp = items[idx];
        items[idx] = items[swapIdx];
        items[swapIdx] = tmp;
        return {
          ...c,
          items: items.map((i, n) => ({ ...i, order: n })),
        };
      }),
    }));
  };

  const deleteChecklist = (id: string) => {
    setData((d) => ({
      ...d,
      checklists: d.checklists.filter((c) => c.id !== id),
    }));
  };

  /* Tag toggle (control 10) */
  const toggleTag = (
    type: "folder" | "file" | "meeting" | "checklist",
    id: string,
    tag: Tag,
  ) => {
    setData((d) => {
      if (type === "folder")
        return {
          ...d,
          folders: d.folders.map((f) =>
            f.id === id ? { ...f, tags: toggleTagArray(f.tags, tag) } : f,
          ),
        };
      if (type === "file")
        return {
          ...d,
          files: d.files.map((f) =>
            f.id === id ? { ...f, tags: toggleTagArray(f.tags, tag) } : f,
          ),
        };
      if (type === "meeting")
        return {
          ...d,
          meetings: d.meetings.map((m) =>
            m.id === id ? { ...m, tags: toggleTagArray(m.tags, tag) } : m,
          ),
        };
      return {
        ...d,
        checklists: d.checklists.map((c) =>
          c.id === id ? { ...c, tags: toggleTagArray(c.tags, tag) } : c,
        ),
      };
    });
  };

  /* Pin toggle (control 12) */
  const togglePin = (
    type: "folder" | "file" | "checklist",
    id: string,
  ) => {
    setData((d) => {
      if (type === "folder")
        return {
          ...d,
          folders: d.folders.map((f) =>
            f.id === id ? { ...f, pinned: !f.pinned } : f,
          ),
        };
      if (type === "file")
        return {
          ...d,
          files: d.files.map((f) =>
            f.id === id ? { ...f, pinned: !f.pinned } : f,
          ),
        };
      return {
        ...d,
        checklists: d.checklists.map((c) =>
          c.id === id ? { ...c, pinned: !c.pinned } : c,
        ),
      };
    });
  };

  /* Contract template (control 14) */
  const createContractFromTemplate = (fields: {
    date: string;
    parties: string;
    subject: string;
    terms: string;
    signature: string;
  }) => {
    const content = [
      "CONTRACT NOTE",
      "============",
      `Date: ${fields.date}`,
      `Parties: ${fields.parties}`,
      `Subject: ${fields.subject}`,
      "",
      "Terms:",
      fields.terms,
      "",
      `Signature: ${fields.signature}`,
    ].join("\n");
    const file: FileItem = {
      id: uid(),
      name: `Contract-${fields.date}.txt`,
      kind: "text",
      content,
      mimeType: "text/plain",
      folderId: selectedFolderId,
      pinned: false,
      tags: ["contract"],
    };
    setData((d) => ({ ...d, files: [...d.files, file] }));
    setShowContractForm(false);
  };

  /* Derived / filtered views (control 7, 11) */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const searchLower = search.toLowerCase();

  const meetingsInRange = data.meetings.filter((m) => {
    const d = new Date(m.date + "T00:00:00");
    const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 60;
  });

  const filterByTag = <T extends { tags: Tag[] }>(items: T[]): T[] =>
    tagFilter ? items.filter((i) => i.tags.includes(tagFilter)) : items;

  const visibleFolders = filterByTag(
    data.folders.filter(
      (f) => !searchLower || f.name.toLowerCase().includes(searchLower),
    ),
  ).sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const visibleFiles = filterByTag(
    data.files.filter(
      (f) =>
        f.folderId === selectedFolderId &&
        f.kind !== "voice" &&
        (!searchLower ||
          f.name.toLowerCase().includes(searchLower) ||
          (f.kind === "text" &&
            f.content.toLowerCase().includes(searchLower))),
    ),
  ).sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const visibleMeetings = filterByTag(
    meetingsInRange.filter(
      (m) => !searchLower || m.title.toLowerCase().includes(searchLower),
    ),
  ).sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));

  const visibleChecklists = filterByTag(
    data.checklists.filter(
      (c) =>
        !searchLower ||
        c.title.toLowerCase().includes(searchLower) ||
        c.items.some((i) => i.text.toLowerCase().includes(searchLower)),
    ),
  ).sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const voiceNotes = data.files.filter((f) => f.kind === "voice");

  const editingFile = editingFileId
    ? data.files.find((f) => f.id === editingFileId) ?? null
    : null;
  const previewingFile = previewingFileId
    ? data.files.find((f) => f.id === previewingFileId) ?? null
    : null;
  const movingFile = moveFileId
    ? data.files.find((f) => f.id === moveFileId) ?? null
    : null;

  const selectedFolderName = selectedFolderId
    ? data.folders.find((f) => f.id === selectedFolderId)?.name ?? ""
    : "Root";

  return (
    <div className="desk">
      {/* Toolbar (controls 11, 15, 16, 17) */}
      <div className="desk__toolbar">
        <input
          type="text"
          className="desk__search"
          placeholder="Search folders, files, text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="search"
        />
        <div className="desk__model-switch">
          <span className="desk__model-label">Model</span>
          <select
            className="desk__model-select"
            value={modelFlag}
            onChange={(e) =>
              setModelFlag(e.target.value === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini")
            }
            aria-label="model flag"
          >
            <option value="gpt-4o-mini">gpt-4o-mini</option>
            <option value="gpt-4o">gpt-4o</option>
          </select>
        </div>
        <p className="desk__status">
          {syncOffline ? "sync is offline" : "sync is live"}
        </p>
        <p className="desk__status">
          {modelOffline ? "model is offline" : "model is live"}
        </p>
        <button
          type="button"
          className="desk__logout"
          onClick={onLogout}
        >
          Logout
        </button>
      </div>

      {/* Tag filter (control 10) */}
      <div className="desk__tags">
        <span className="desk__tags-label">Tags:</span>
        {ALL_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={`desk__tag-btn${tagFilter === t ? " desk__tag-btn--active" : ""}`}
            onClick={() => setTagFilter(tagFilter === t ? null : t)}
          >
            {t}
          </button>
        ))}
        {tagFilter && (
          <button
            type="button"
            className="desk__tag-clear"
            onClick={() => setTagFilter(null)}
          >
            clear
          </button>
        )}
      </div>

      {/* Folders (control 1, 12, 13, 23) */}
      <section className="desk__section">
        <div className="desk__section-header">
          <h2 className="desk__heading">Folders</h2>
          <button type="button" className="desk__btn" onClick={createFolder}>
            New Folder
          </button>
        </div>
        <ul className="desk__list">
          {visibleFolders.map((f) => (
            <li
              key={f.id}
              className={`desk__item${f.pinned ? " desk__item--pinned" : ""}${selectedFolderId === f.id ? " desk__item--selected" : ""}`}
            >
              <button
                type="button"
                className="desk__item-name"
                onClick={() =>
                  setSelectedFolderId(
                    f.id === selectedFolderId ? null : f.id,
                  )
                }
              >
                {f.pinned ? "\u{1F4CC} " : ""}{f.name}
              </button>
              <div className="desk__item-tags">
                {f.tags.map((t) => (
                  <span key={t} className="desk__tag-badge">{t}</span>
                ))}
              </div>
              <div className="desk__item-actions">
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt("Rename folder:", f.name);
                    if (name) renameFolder(f.id, name);
                  }}
                >
                  Rename
                </button>
                <button type="button" onClick={() => duplicateFolder(f.id)}>
                  Duplicate
                </button>
                <button type="button" onClick={() => togglePin("folder", f.id)}>
                  {f.pinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" onClick={() => exportFolder(f)}>
                  Export
                </button>
                <button type="button" onClick={() => deleteFolder(f.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {visibleFolders.length === 0 && (
            <li className="desk__empty">No folders</li>
          )}
        </ul>
      </section>

      {/* Files (controls 2, 3, 4, 12, 13, 23, 24, 25) */}
      <section className="desk__section">
        <div className="desk__section-header">
          <h2 className="desk__heading">Files — {selectedFolderName}</h2>
          <div className="desk__btn-group">
            <button type="button" className="desk__btn" onClick={createTextFile}>
              New Text
            </button>
            <button
              type="button"
              className="desk__btn"
              onClick={() => pdfInputRef.current?.click()}
            >
              Attach PDF
            </button>
            <button
              type="button"
              className="desk__btn"
              onClick={() => docInputRef.current?.click()}
            >
              Attach Document
            </button>
            <button
              type="button"
              className="desk__btn"
              onClick={() => setShowContractForm(true)}
            >
              Contract Template
            </button>
          </div>
        </div>
        <input
          ref={pdfInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="desk__file-input"
          onChange={(e) => handleFileUpload(e, "pdf")}
        />
        <input
          ref={docInputRef}
          type="file"
          className="desk__file-input"
          onChange={(e) => handleFileUpload(e, "document")}
        />
        <ul className="desk__list">
          {visibleFiles.map((f) => (
            <li
              key={f.id}
              className={`desk__item${f.pinned ? " desk__item--pinned" : ""}`}
            >
              <span className="desk__item-name">
                {f.pinned ? "\u{1F4CC} " : ""}{f.name}{" "}
                <span className="desk__item-kind">({f.kind})</span>
              </span>
              <div className="desk__item-tags">
                {f.tags.map((t) => (
                  <span key={t} className="desk__tag-badge">{t}</span>
                ))}
              </div>
              <div className="desk__item-actions">
                {f.kind === "text" && (
                  <button type="button" onClick={() => setEditingFileId(f.id)}>
                    Edit
                  </button>
                )}
                {f.kind === "text" && (
                  <button type="button" onClick={() => setPreviewingFileId(f.id)}>
                    Preview
                  </button>
                )}
                {f.kind === "pdf" && (
                  <button type="button" onClick={() => openPdf(f.content)}>
                    Open
                  </button>
                )}
                {f.kind === "voice" && (
                  <button type="button" onClick={() => playVoice(f.content)}>
                    Play
                  </button>
                )}
                <button type="button" onClick={() => duplicateFile(f.id)}>
                  Duplicate
                </button>
                <button type="button" onClick={() => setMoveFileId(f.id)}>
                  Move
                </button>
                <button type="button" onClick={() => togglePin("file", f.id)}>
                  {f.pinned ? "Unpin" : "Pin"}
                </button>
                <button type="button" onClick={() => exportFile(f)}>
                  Export
                </button>
                <button type="button" onClick={() => deleteFile(f.id)}>
                  Delete
                </button>
              </div>
              <div className="desk__item-tags">
                {ALL_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`desk__tag-toggle${f.tags.includes(t) ? " desk__tag-toggle--on" : ""}`}
                    onClick={() => toggleTag("file", f.id, t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {visibleFiles.length === 0 && (
            <li className="desk__empty">No files</li>
          )}
        </ul>
      </section>

      {/* Meetings (controls 6, 7, 8, 21, 22) */}
      <section className="desk__section">
        <div className="desk__section-header">
          <h2 className="desk__heading">Meetings (60 days)</h2>
        </div>
        <form
          className="desk__meeting-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const title = (fd.get("title") as string).trim();
            const date = fd.get("date") as string;
            if (title && date) addMeeting(title, date);
            form.reset();
          }}
        >
          <input
            type="text"
            name="title"
            placeholder="Meeting title"
            aria-label="meeting title"
            required
          />
          <input
            type="date"
            name="date"
            aria-label="meeting date"
            required
            defaultValue={dateInDays(1)}
            min={todayISO()}
            max={dateInDays(30)}
          />
          <button type="submit" className="desk__btn">Add Meeting</button>
        </form>
        <ul className="desk__list">
          {visibleMeetings.map((m) => (
            <li
              key={m.id}
              className={`desk__item${m.done ? " desk__item--done" : ""}`}
            >
              <label className="desk__meeting-check">
                <input
                  type="checkbox"
                  checked={m.done}
                  onChange={() => toggleMeetingDone(m.id)}
                />
                <span className="desk__item-name">{m.title}</span>
              </label>
              <span className="desk__meeting-date">{m.date}</span>
              <DueBadge date={m.date} done={m.done} />
              <div className="desk__item-tags">
                {m.tags.map((t) => (
                  <span key={t} className="desk__tag-badge">{t}</span>
                ))}
              </div>
              <div className="desk__item-actions">
                {ALL_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`desk__tag-toggle${m.tags.includes(t) ? " desk__tag-toggle--on" : ""}`}
                    onClick={() => toggleTag("meeting", m.id, t)}
                  >
                    {t}
                  </button>
                ))}
                <button type="button" onClick={() => deleteMeeting(m.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {visibleMeetings.length === 0 && (
            <li className="desk__empty">No meetings in range</li>
          )}
        </ul>
        <MonthCalendar meetings={data.meetings} />
      </section>

      {/* Checklists (control 9) */}
      <section className="desk__section">
        <div className="desk__section-header">
          <h2 className="desk__heading">Checklists</h2>
          <button type="button" className="desk__btn" onClick={createChecklist}>
            New Checklist
          </button>
        </div>
        <ul className="desk__list">
          {visibleChecklists.map((c) => (
            <li key={c.id} className="desk__checklist">
              <div className="desk__checklist-header">
                <span className="desk__item-name">
                  {c.pinned ? "\u{1F4CC} " : ""}{c.title}
                </span>
                <div className="desk__item-actions">
                  <button type="button" onClick={() => togglePin("checklist", c.id)}>
                    {c.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button type="button" onClick={() => deleteChecklist(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <form
                className="desk__checklist-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const input = form.querySelector("input") as HTMLInputElement;
                  if (input.value.trim()) {
                    addChecklistItem(c.id, input.value.trim());
                    input.value = "";
                  }
                }}
              >
                <input type="text" placeholder="Add item" aria-label="add checklist item" />
                <button type="submit">Add</button>
              </form>
              <ol className="desk__checklist-items">
                {[...c.items]
                  .sort((a, b) => a.order - b.order)
                  .map((item) => (
                    <li key={item.id} className="desk__checklist-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => toggleChecklistItem(c.id, item.id)}
                        />
                        <span
                          className={item.done ? "desk__checklist-text--done" : ""}
                        >
                          {item.text}
                        </span>
                      </label>
                      <div className="desk__checklist-actions">
                        <button
                          type="button"
                          onClick={() => moveChecklistItem(c.id, item.id, "up")}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveChecklistItem(c.id, item.id, "down")}
                        >
                          Down
                        </button>
                      </div>
                    </li>
                  ))}
              </ol>
            </li>
          ))}
          {visibleChecklists.length === 0 && (
            <li className="desk__empty">No checklists</li>
          )}
        </ul>
      </section>

      {/* Voice notes (control 5) */}
      <section className="desk__section">
        <div className="desk__section-header">
          <h2 className="desk__heading">Voice Notes</h2>
          {recording ? (
            <button
              type="button"
              className="desk__btn desk__btn--stop"
              onClick={stopRecording}
            >
              Stop Recording
            </button>
          ) : (
            <button type="button" className="desk__btn" onClick={startRecording}>
              Record
            </button>
          )}
        </div>
        <ul className="desk__list">
          {voiceNotes.map((v) => (
            <li key={v.id} className="desk__item">
              <span className="desk__item-name">{v.name}</span>
              <div className="desk__item-actions">
                <button type="button" onClick={() => playVoice(v.content)}>
                  Play
                </button>
                <button type="button" onClick={() => exportFile(v)}>
                  Export
                </button>
                <button type="button" onClick={() => deleteFile(v.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {voiceNotes.length === 0 && (
            <li className="desk__empty">No voice notes</li>
          )}
        </ul>
      </section>

      {/* Text editor modal (control 2) */}
      {editingFile && (
        <div className="desk__modal">
          <div className="desk__modal-content">
            <h3 className="desk__modal-title">Edit — {editingFile.name}</h3>
            <input
              type="text"
              className="desk__modal-input"
              value={editingFile.name}
              onChange={(e) => updateFile(editingFile.id, { name: e.target.value })}
              aria-label="file name"
            />
            <textarea
              className="desk__modal-textarea"
              value={editingFile.content}
              onChange={(e) =>
                updateFile(editingFile.id, { content: e.target.value })
              }
              aria-label="file content"
            />
            <div className="desk__modal-actions">
              <button type="button" onClick={() => setEditingFileId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-only preview modal (control 25) */}
      {previewingFile && (
        <div className="desk__modal">
          <div className="desk__modal-content">
            <h3 className="desk__modal-title">
              Preview — {previewingFile.name}
            </h3>
            <pre className="desk__preview">{previewingFile.content}</pre>
            <div className="desk__modal-actions">
              <button type="button" onClick={() => setPreviewingFileId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move dialog (control 24) */}
      {movingFile && (
        <div className="desk__modal">
          <div className="desk__modal-content">
            <h3 className="desk__modal-title">Move — {movingFile.name}</h3>
            <ul className="desk__move-list">
              <li>
                <button type="button" onClick={() => moveFile(movingFile.id, null)}>
                  Root (no folder)
                </button>
              </li>
              {data.folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => moveFile(movingFile.id, f.id)}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="desk__modal-actions">
              <button type="button" onClick={() => setMoveFileId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contract template form (control 14) */}
      {showContractForm && (
        <ContractForm
          onSubmit={createContractFromTemplate}
          onCancel={() => setShowContractForm(false)}
        />
      )}
    </div>
  );
}
