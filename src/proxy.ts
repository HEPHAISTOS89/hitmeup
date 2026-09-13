import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function proxy(request: NextRequest) {
  const client = auth0();
  const response = client ? await client.middleware(request) : NextResponse.next();
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("permissions-policy", "geolocation=(self), camera=(), microphone=()");
  return response;
}

export const config = {
  // Auth0 SDK v4 needs to see auth/session refresh requests and API calls,
  // while static assets must bypass middleware.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
