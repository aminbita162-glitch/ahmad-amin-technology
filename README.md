# Ahmad & Amin Technology 2026

The exclusive two-brothers app. Two people — Amin (Germany) and Ahmad (Iran) — on three screens: gate, private thread, isolated model room. Version 1.0.0.

---

## Author

Amin Azimi
- Surname: Azimi
- Role: AI Architect
- Practice: end-to-end system development and business challenge
- Brand: Azimi Innovation Lab
- Project: Ahmad & Amin Technology 2026
- Version: 1.0.0

This project is Ahmad & Amin Technology 2026, version 1.0.0, by Amin Azimi of Azimi Innovation Lab. The running app is a private two-person meridian between Germany and Iran, with whitelist access, row-level privacy, and a server-side model room. It is not a public network and not a third-account host. The owner and successors may sell, assign, license, gift, charge, or keep developing it without restriction from this authorship record.

---

## License Freedom

Copyright (c) 2026 Amin Azimi.

The copyright holder, and after the holder every lawful heir, estate, and successor, holds the full and unqualified right to use, modify, develop, finish, host, sell, assign, transfer, license, sublicense, gift, publish, charge for, or withhold this project, in whole or in part, in any form, for any price or for none, in any country. No clause in this repository limits those acts. No copyleft, no share-alike, no non-commercial lock, no field-of-use ban, no time limit.

Third parties receive rights only when the holder or a successor grants them in writing. Absence of a grant is not a ban on the holder. Secrets, keys, and private message contents are not part of the licensed work and must never be committed.

Owner line, unchanged:
Amin Azimi | AI Architect | End-to-end system development | Business challenge | Azimi Innovation Lab

---

## Product Boundary

Two people. Amin, Germany. Ahmad, Iran.
Three screens only: gate, private thread, isolated model room.

- Gate brand: AI Architect Amin Azimi / Ahmad & Amin Technology 2026 / The exclusive two-brothers app.
- Speed is a requirement: optimistic send, no extra round trip before paint, server work only for auth and model.
- Iran path: same origin for chat and model. WebSocket may die. Polling fallback is mandatory, 3000 ms, only while the socket is down.
- Typing indicator is allowed only from a remote typing event. Never from the local keystroke.

Visual system: Meridian Seal. Ink #07080c. Paper #efe7dc. Mute #9a9186. Amin signal glacial #9fd7ff. Ahmad signal oxidized copper #c4a574. Fault dried seal #c45c4a. Vazirmatn for Persian, Syne for the English title. No other fonts.

---

## Env Contract

Names only, never values, in `.env.example`:

```
NEXT_PUBLIC_APP_NAME=Ahmad & Amin Technology 2026
SESSION_SECRET=
DEMO_MODE=false
AMIN_EMAIL=
AMIN_PASSWORD=
AMIN_NAME=Amin
AHMAD_EMAIL=
AHMAD_PASSWORD=
AHMAD_NAME=Ahmad
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
RATE_LIMIT_PER_HOUR=30
```

Production boot refuses to start if `DEMO_MODE=true` or `SESSION_SECRET` is shorter than 32 characters.

If `NEXT_PUBLIC_SUPABASE_URL` or `OPENAI_API_KEY` is empty, the code path is built and sealed BLOCKED for live proof. No hosts are invented.

---

## Phase Map

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Root Truth | PASS |
| 2 | Frame | Not started |
| 3 | Whitelist Session | Not started |
| 4 | Data Seal | Not started |
| 5 | Thread | Not started |
| 6 | Model Room | Not started |
| 7 | Install, Resilience, Test Home | Not started |
| 8 | Release Seal | Not started |

Each phase writes a seal to `./execution/phase-N-seal.txt` when it ends. A missing seal means the phase is not done.

---

## Non-Goals

- No public signup, admin panel, third user, analytics, or advertising.
- No decorative library, theme toggle, animation pack, icon pack, or component kit.
- No Tailwind. Visual system is hand-written CSS.
- No copyleft, no share-alike, no non-commercial lock, no field-of-use ban.
- No stored model key in localStorage, sessionStorage, or a NEXT_PUBLIC variable.
- No claim that chat is cross-country live unless the seal proves the env keys exist and a real call succeeded.
- No rewrite of DIRECTIVE.txt. The contract is read-only.

---

## Honest Blocked Lines

This section states the truth about what is not yet live.

- Supabase (sync): this section is not yet live.
- OpenAI model (model room): this section is not yet live.

These lines are not decorative. They reflect the actual state of the project as of phase 1. When a phase brings a dependency live, the seal will say so and these lines will be updated to match.

---

## Test Home

The visible home is `/test-home` and the root file is `./test-home.txt`. A missing seal means the phase is not done.

---

## Stack Floor

- Node 20
- Next.js 15 App Router, React 19, TypeScript strict
- No Tailwind. Hand-written CSS in `app/globals.css`.
- Supabase Postgres + Realtime, used only after env exists
- OpenAI chat completions, server route only
- Default model gpt-4o-mini, explicit switch gpt-4o
- Deploy target Vercel, custom domain preferred over vercel.app
