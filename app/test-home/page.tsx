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
 * Phase 7 — Test Home.
 *
 * A sealed checklist, not a toy. It lists phase seals, health booleans,
 * and whether sync (Supabase) and model (OpenAI) are live or blocked.
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
