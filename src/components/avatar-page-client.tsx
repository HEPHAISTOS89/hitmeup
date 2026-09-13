"use client";

import { ArrowLeft, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, getCosmetics, getProfile, getSession } from "@/lib/client-api";
import type { CosmeticProjection, ProfileProjection } from "@/lib/types";
import { AvatarStudio } from "./avatar-studio";
import { HitMeUpLogo } from "./hitmeup-logo";

const PREVIEW_PROFILE: ProfileProjection = {
  displayName: "Taylor Garcia",
  avatarUrl: null,
  bio: null,
  eduDomain: "ttu.edu",
  solanaWallet: null,
  interests: [],
  avatarConfig: { skin: "golden", face: "smile", hair: "curls", hairColor: "ink", outfit: "hoodie", accessory: "none" },
  rating: 4.9,
  ratingCount: 2,
  completedCount: 3,
};

type PageState = "loading" | "ready" | "unauthenticated" | "error";

export function AvatarPageClient({ preview = false }: { preview?: boolean }) {
  const [state, setState] = useState<PageState>(preview ? "ready" : "loading");
  const [profile, setProfile] = useState<ProfileProjection | null>(preview ? PREVIEW_PROFILE : null);
  const [catalog, setCatalog] = useState<CosmeticProjection[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">(preview ? "ready" : "loading");

  useEffect(() => {
    if (preview) return;
    let active = true;
    getSession().then(async (session) => {
      if (!session.authenticated) {
        if (active) setState("unauthenticated");
        return;
      }
      const [nextProfile, nextCatalog] = await Promise.all([getProfile(), getCosmetics()]);
      if (!active) return;
      setProfile(nextProfile);
      setCatalog(nextCatalog);
      setCatalogStatus("ready");
      setState("ready");
    }).catch((error) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) setState("unauthenticated");
      else setState("error");
      setCatalogStatus("error");
    });
    return () => { active = false; };
  }, [preview]);

  if (state !== "ready") {
    return <main className="avatar-editor-page"><section className="avatar-route-state" aria-live="polite">
      <HitMeUpLogo size={58} title="HitMeUp" />
      {state === "loading" ? <LoaderCircle className="spin" size={24} /> : state === "error" ? <TriangleAlert size={24} /> : <ShieldCheck size={24} />}
      <h1>{state === "loading" ? "Loading your avatar…" : state === "unauthenticated" ? "Verify before customizing." : "Your avatar is temporarily unavailable."}</h1>
      <p>{state === "loading" ? "Checking profile and server-owned cosmetics." : state === "unauthenticated" ? "Use your university Microsoft account to open the editor." : "No profile or ownership state was changed."}</p>
      {state !== "loading" && <a className="primary-action" href={state === "unauthenticated" ? "/auth/login?returnTo=/avatar" : "/app"}>{state === "unauthenticated" ? "Continue with Microsoft" : "Back to HitMeUp"}</a>}
    </section></main>;
  }

  return <main className="avatar-editor-page">
    <header className="avatar-route-header"><a href="/app"><ArrowLeft size={16} /> Back to profile</a><div><span className="section-kicker">LAURA&apos;S AVATAR WORKSHOP · BACKEND CONNECTED</span><h1>Your avatar</h1></div></header>
    <AvatarStudio profile={profile} catalog={catalog} catalogStatus={catalogStatus} previewMode={preview} onProfileChange={setProfile} onCatalogChange={setCatalog} />
  </main>;
}
