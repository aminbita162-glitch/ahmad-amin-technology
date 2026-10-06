import { NextRequest, NextResponse } from "next/server";
import {
  attemptLogin,
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const result = attemptLogin(email, password);

  if (!result.ok || !result.handle) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = createSessionToken(result.handle);
  const response = NextResponse.json({ handle: result.handle, name: result.name });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
