import { NextResponse } from "next/server";
import { requireVerifiedStudent } from "@/lib/auth0";

/** Minimal BFF session projection: no Auth0 subject, email, wallet, or token. */
export async function GET() {
  const auth = await requireVerifiedStudent();
  if (!auth.ok) {
    if (auth.code === "unauthenticated") return NextResponse.json({ authenticated: false, user: null });
    return NextResponse.json({ error: auth.code }, { status: auth.status });
  }
  return NextResponse.json({ authenticated: true, user: { verified: true, eduDomain: auth.student.eduDomain } });
}
