"use client";

import { ArrowRight, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { CampusMarketplace, type AppView } from "./campus-marketplace";
import { HitMeUpLogo } from "./hitmeup-logo";
import { ApiError, getProfile, getSession } from "@/lib/client-api";

type GateState = "loading" | "authenticated" | "onboarding" | "unauthenticated" | "denied" | "unavailable";

function needsOnboarding(profile: Awaited<ReturnType<typeof getProfile>>) {
  return !profile || (profile.displayName === "Student" && !profile.bio && profile.interests.length === 0);
}

export function AppGate({ preview = false, initialView }: { preview?: boolean; initialView?: AppView }) {
  const [state, setState] = useState<GateState>(preview ? "authenticated" : "loading");

  useEffect(() => {
    if (preview) return;
    let active = true;
    getSession()
      .then(async (session) => {
        if (!active) return;
        if (!session.authenticated) {
          setState("unauthenticated");
          return;
        }
        try {
          const profile = await getProfile();
          if (active) setState(needsOnboarding(profile) ? "onboarding" : "authenticated");
        } catch {
          if (active) setState("unavailable");
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) setState("unauthenticated");
        else if (error instanceof ApiError && error.status === 403) setState("denied");
        else setState("unavailable");
      });
    return () => { active = false; };
  }, [preview]);

  if (state === "authenticated") {
    return <CampusMarketplace initialEntry="app" dataMode={preview ? "preview" : "live"} initialView={initialView} />;
  }
  if (state === "onboarding") {
    return <CampusMarketplace initialEntry="profile" dataMode="live" />;
  }

  const loading = state === "loading";
  const denied = state === "denied";
  const unavailable = state === "unavailable";
  return (
    <main className="entry-screen status-screen status-screen-single">
      <section className={`status-card ${unavailable ? "status-failure" : "status-pending"}`} aria-live="polite">
        <HitMeUpLogo size={58} title="HitMeUp" />
        <div className="status-icon" aria-hidden="true">
          {loading ? <LoaderCircle className="spin" size={28} /> : unavailable ? <TriangleAlert size={30} /> : <ShieldCheck size={30} />}
        </div>
        <p className="entry-kicker">VERIFIED CAMPUS ACCESS</p>
        <h1>{loading ? "Checking your student access…" : denied ? "This account is not eligible yet." : unavailable ? "Sign-in is unavailable here." : "Verify before entering."}</h1>
        <p>{loading ? "HitMeUp is confirming the minimal session state." : denied ? "Use a verified, approved university Microsoft account. No profile or campus data was opened." : unavailable ? "This environment is missing its authentication configuration. No local account fallback is used." : "Use your university Microsoft account to access student services."}</p>
        {!loading && <a className="primary-action" href={unavailable ? "/login" : denied ? "/auth/logout" : "/auth/login?returnTo=/app&connection=ttu-development"}>{unavailable ? "Back to sign in" : denied ? "Try another account" : "Continue with Microsoft"} <ArrowRight size={16} /></a>}
      </section>
    </main>
  );
}
