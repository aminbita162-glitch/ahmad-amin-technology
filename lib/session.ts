import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Whitelist Session — Phase 3
 *
 * Two users, both from environment variables. No public signup.
 * The session cookie is an HMAC-SHA256 signed token, never a plain
 * identifier. The cookie is httpOnly so client scripts cannot read it.
 */

export const SESSION_COOKIE_NAME = "aa_session";
export const SESSION_MAX_AGE_SECONDS = 18 * 60 * 60; // 18 hours

export type Handle = "amin" | "ahmad";

export interface WhitelistUser {
  handle: Handle;
  email: string;
  password: string;
  name: string;
}

interface SessionPayload {
  handle: Handle;
}

function env(name: string): string {
  const value = process.env[name];
  return value ?? "";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDemoMode(): boolean {
  return env("DEMO_MODE") === "true";
}

function sessionSecret(): string {
  return env("SESSION_SECRET");
}

/**
 * Production guard. When true, the app must refuse to serve.
 * Fires only in production: demo mode left on, or a secret too
 * short to be safe, both mean the container is not ready.
 */
export function productionGuardBlocks(): boolean {
  if (!isProduction()) return false;
  return isDemoMode() || sessionSecret().length < 32;
}

export function getWhitelistUsers(): WhitelistUser[] {
  return [
    {
      handle: "amin",
      email: env("AMIN_EMAIL"),
      password: env("AMIN_PASSWORD"),
      name: env("AMIN_NAME") || "Amin",
    },
    {
      handle: "ahmad",
      email: env("AHMAD_EMAIL"),
      password: env("AHMAD_PASSWORD"),
      name: env("AHMAD_NAME") || "Ahmad",
    },
  ];
}

function sign(body: string): string {
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function createSessionToken(handle: Handle): string {
  return sign(JSON.stringify({ handle }));
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token) return null;
  const sep = token.lastIndexOf(".");
  if (sep < 0) return null;
  const body = token.slice(0, sep);
  const sig = token.slice(sep + 1);
  let payload: SessionPayload;
  try {
    payload = JSON.parse(body) as SessionPayload;
  } catch {
    return null;
  }
  if (payload.handle !== "amin" && payload.handle !== "ahmad") return null;
  const expected = sign(body);
  const expectedSig = expected.slice(expected.lastIndexOf(".") + 1);
  if (!safeEqual(sig, expectedSig)) return null;
  return payload;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
  } catch {
    return false;
  }
}

export interface LoginResult {
  ok: boolean;
  handle?: Handle;
  name?: string;
}

/**
 * Authenticate against the env whitelist.
 * Outside demo mode, an empty password is always rejected.
 * Inside demo mode, an empty password is accepted for a known email
 * so the app can run without real credentials stored.
 */
export function attemptLogin(email: string, password: string): LoginResult {
  const users = getWhitelistUsers();
  const user = users.find((u) => u.email !== "" && u.email === email);
  if (!user) return { ok: false };

  if (password === "") {
    if (!isDemoMode()) return { ok: false };
    return { ok: true, handle: user.handle, name: user.name };
  }

  if (!safeEqual(password, user.password)) return { ok: false };
  return { ok: true, handle: user.handle, name: user.name };
}

export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}

export function clearSessionCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return { ...sessionCookieOptions(), maxAge: 0 };
}
