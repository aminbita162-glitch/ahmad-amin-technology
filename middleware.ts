import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Production guard — middleware.
 *
 * In production the container must refuse to serve if it is not ready:
 * DEMO_MODE left on, or SESSION_SECRET shorter than 32 characters.
 * Either condition means the deployment is not sealed for live use.
 */
export function middleware(_request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const demoMode = process.env.DEMO_MODE === "true";
  const secret = process.env.SESSION_SECRET ?? "";

  if (isProduction && (demoMode || secret.length < 32)) {
    return new NextResponse("Service Unavailable", { status: 503 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
