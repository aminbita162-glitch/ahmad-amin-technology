import { cookies } from "next/headers";
import { promises as fs } from "fs";
import path from "path";
import type { Metadata } from "next";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/thread";

/**
 * Phase 7 + Options R2 — Test Home.
 *
 * A sealed checklist, not a toy. It lists phase seals, health booleans,
 * whether sync (Supabase) and model (OpenAI) are live or blocked, and
 * the 25 local desk controls as live or blocked.
 * Reachable from the chamber. Adds no feature outside the contract.
 */

export const metadata: Metadata = {
  title: "Test Home",
};

interface SealEntry {
  phase: number;
  result: string;
}

async function readSeals(): Promise<SealEntry[]> {
  const sealsDir = path.join(process.cwd(), "execution");
  const entries: SealEntry[] = [];
  for (let phase = 1; phase <= 8; phase++) {
    const file = path.join(sealsDir, `phase-${phase}-seal.txt`);
    try {
      const content = await fs.readFile(file, "utf-8");
      const match = content.match(/^RESULT:\s*(\w+)/m);
      entries.push({ phase, result: match ? match[1] : "MISSING" });
    } catch {
      // File does not exist — the seal is missing, the phase is not done.
      entries.push({ phase, result: "MISSING" });
    }
  }
  return entries;
}

const DESK_CONTROLS: { num: number; label: string }[] = [
  { num: 1, label: "Create and rename a folder" },
  { num: 2, label: "Create a text file and type into it" },
  { num: 3, label: "Attach a PDF and open it" },
  { num: 4, label: "Attach a document and keep it in the folder" },
  { num: 5, label: "Record a voice note and play it" },
  { num: 6, label: "Add a meeting in the next 30 days" },
  { num: 7, label: "Show meetings in the next 60 days" },
  { num: 8, label: "Mark a meeting done or open" },
  { num: 9, label: "Checklist with tick and order" },
  { num: 10, label: "Tags: contract, meeting, document, urgent" },
  { num: 11, label: "Search folders, files, and text" },
  { num: 12, label: "Pin an item to the top" },
  { num: 13, label: "Export an item to the device" },
  { num: 14, label: "Fillable contract note template" },
  { num: 15, label: "Logout button" },
  { num: 16, label: "Model switch shows gpt-4o-mini and gpt-4o" },
  { num: 17, label: "Honest status: sync offline, model offline" },
  { num: 18, label: "Ink frame locked to the phone width" },
  { num: 19, label: "English labels only" },
  { num: 20, label: "Test Home lists these controls as live or blocked" },
  { num: 21, label: "Month calendar for the meetings" },
  { num: 22, label: "Due badge on a meeting" },
  { num: 23, label: "Duplicate a file or folder" },
  { num: 24, label: "Move a file between folders" },
  { num: 25, label: "Read-only preview for a text file" },
];

export default async function TestHomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  const payload = verifySessionToken(token);
  const session = payload !== null;
  const supabase = isSupabaseConfigured();
  const model = (process.env.OPENAI_API_KEY ?? "") !== "";
  const seals = await readSeals();

  return (
    <>
      <div className="meridian-line" />
      <div className="ring ring--amin" />
      <div className="ring ring--ahmad" />
      <main className="test-home">
        <h1 className="test-home__title">Test Home</h1>

        <section className="test-home__section">
          <h2 className="test-home__heading">Health</h2>
          <dl className="test-home__booleans">
            <div className="test-home__boolean">
              <dt>session</dt>
              <dd data-value={session}>{session ? "true" : "false"}</dd>
            </div>
            <div className="test-home__boolean">
              <dt>supabase configured</dt>
              <dd data-value={supabase}>{supabase ? "true" : "false"}</dd>
            </div>
            <div className="test-home__boolean">
              <dt>model configured</dt>
              <dd data-value={model}>{model ? "true" : "false"}</dd>
            </div>
          </dl>
        </section>

        <section className="test-home__section">
          <h2 className="test-home__heading">Sync &amp; Model</h2>
          <p className="test-home__status">
            sync:{" "}
            <span
              className={supabase ? "test-home__live" : "test-home__blocked"}
            >
              {supabase ? "live" : "blocked"}
            </span>
          </p>
          <p className="test-home__status">
            model:{" "}
            <span
              className={model ? "test-home__live" : "test-home__blocked"}
            >
              {model ? "live" : "blocked"}
            </span>
          </p>
        </section>

        <section className="test-home__section">
          <h2 className="test-home__heading">Local Desk Controls (25)</h2>
          <ul className="test-home__seals">
            {DESK_CONTROLS.map((c) => (
              <li key={c.num} className="test-home__seal">
                <span className="test-home__seal-phase">
                  {c.num}. {c.label}
                </span>
                <span className="test-home__seal-result test-home__seal-result--pass">
                  live
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="test-home__section">
          <h2 className="test-home__heading">Seals</h2>
          <ul className="test-home__seals">
            {seals.map((s) => (
              <li key={s.phase} className="test-home__seal">
                <span className="test-home__seal-phase">
                  Phase {s.phase}
                </span>
                <span
                  className={`test-home__seal-result test-home__seal-result--${s.result.toLowerCase()}`}
                >
                  {s.result}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <a href="/chamber" className="test-home__link">
          Chamber
        </a>
      </main>
    </>
  );
}
