"use client";

import {
  ArrowRight,
  BadgeCheck,
  LoaderCircle,
  LocateFixed,
  LockKeyhole,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, updateProfile } from "@/lib/client-api";
import { HitMeUpLogo } from "./hitmeup-logo";
import styles from "./login.module.css";

export type EntryState =
  | "splash"
  | "login"
  | "verification"
  | "profile"
  | "privacy";

type VerificationResult = "pending" | "success" | "failure" | "expired" | "unsupported";

export function EntryFlow({
  initialEntry,
  onComplete,
}: {
  initialEntry: EntryState;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<EntryState>(initialEntry);

  if (step === "splash") return <Arrival onContinue={() => setStep("login")} />;
  if (step === "login") {
    return <Login />;
  }
  if (step === "verification") {
    return (
      <Verification
        result="pending"
        onBack={() => setStep("login")}
        onContinue={() => setStep("profile")}
      />
    );
  }
  if (step === "profile") return <ProfileSetup onContinue={() => setStep("privacy")} />;
  return <PrivacySetup onContinue={onComplete} />;
}

function Arrival({ onContinue }: { onContinue: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onContinue, 1200);
    return () => window.clearTimeout(timer);
  }, [onContinue]);

  return (
    <main className="entry-screen arrival-screen">
      <div className="signal-field" aria-hidden="true"><i /><i /><i /><i /></div>
      <section className="arrival-copy">
        <HitMeUpLogo size={104} title="HitMeUp" />
        <p className="entry-kicker">ONE-OFF HELP · STUDENTS NEARBY</p>
        <h1>Campus is closer than it looks.</h1>
        <p>Find a student who can help—without publishing anyone&apos;s exact location.</p>
        <button className="text-button" type="button" onClick={onContinue}>
          Enter HitMeUp <ArrowRight size={16} />
        </button>
      </section>
    </main>
  );
}

function Login() {
  return (
    <main className={styles.screen}>
      <section className={styles.campus} aria-label="Texas Tech University campus">
        <div className={styles.campusHeading}>
          <p>Texas Tech University</p>
          <h1><span>People nearby.</span><span className={styles.accent}>Addresses nowhere.</span></h1>
          <div className={styles.proofList} aria-label="How HitMeUp protects students">
            <span><BadgeCheck size={17} /> University sign-in gates the network.</span>
            <span><MapPinned size={17} /> Discovery uses approximate service areas.</span>
            <span><LockKeyhole size={17} /> Exact sharing is voluntary and service-scoped.</span>
          </div>
        </div>
        <div className={styles.photoCredit}>
          Photo: <a href="https://commons.wikimedia.org/wiki/File:Texas_Tech_University_April_2022_16_(Administration).jpg" target="_blank" rel="noreferrer">Michael Barera</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> · cropped
        </div>
      </section>
      <section className={styles.signIn} aria-labelledby="login-heading">
        <div className={styles.card}>
          <div className={styles.brand}><HitMeUpLogo size={78} /><strong>HitMeUp</strong><span>Student exchange</span></div>
          <p className={styles.eyebrow}>PRIVATE CAMPUS EXCHANGE</p>
          <h2 id="login-heading">Verify you belong here.</h2>
          <p className={styles.subtitle}>Use your university Microsoft account. Google sign-in is not supported for this initial campus flow.</p>
          <div className={styles.actions}>
          <a className={styles.microsoftButton} href="/auth/login?returnTo=/app">
            <span className="microsoft-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            Continue with Microsoft <ArrowRight size={17} />
          </a>
          </div>
          <p className={styles.footnote}>University access is verified through Microsoft. Your exact location is never part of public discovery.</p>
        </div>
      </section>
    </main>
  );
}

function Verification({
  result,
  onBack,
  onContinue,
}: {
  result: VerificationResult;
  onBack: () => void;
  onContinue: () => void;
}) {
  const content: Record<Exclude<VerificationResult, "pending">, { title: string; copy: string }> = {
    success: { title: "Student status confirmed.", copy: "Only limited profile information should be public until the final identity policy is verified." },
    failure: { title: "We could not verify this account.", copy: "Return to Microsoft and try again. No campus profile has been created." },
    expired: { title: "That verification link expired.", copy: "Start a fresh Microsoft sign-in. Old verification state is not reused." },
    unsupported: { title: "This school is not supported yet.", copy: "The current launch is limited to the configured university tenant." },
  };

  return (
    <main className="entry-screen status-screen status-screen-single">
      <section className={`status-card status-${result}`} aria-live="polite">
        <div className="status-icon" aria-hidden="true">
          {result === "pending" && <LoaderCircle className="spin" size={28} />}
          {result === "success" && <BadgeCheck size={30} />}
          {result === "failure" && <TriangleAlert size={30} />}
          {result === "expired" && <RefreshCw size={28} />}
          {result === "unsupported" && <ShieldCheck size={30} />}
        </div>
        <p className="entry-kicker">UNIVERSITY VERIFICATION</p>
        <h1>{result === "pending" ? "Waiting for Microsoft…" : content[result].title}</h1>
        <p>{result === "pending" ? "Complete the secure sign-in in the Microsoft window. Do not close this page." : content[result].copy}</p>
        {result === "success" ? (
          <button className="primary-action" type="button" onClick={onContinue}>Build my profile <ArrowRight size={16} /></button>
        ) : result === "pending" ? null : (
          <button className="secondary-button" type="button" onClick={onBack}>Back to sign in</button>
        )}
      </section>
    </main>
  );
}

function ProfileSetup({ onContinue }: { onContinue: () => void }) {
  const [name, setName] = useState("");
  const [program, setProgram] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !program.trim()) {
      setError("Add the name and program you want shown to other verified students.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // The profile contract has no dedicated program field yet. Preserve the
      // student's explicit choice as an interest rather than dropping it.
      await updateProfile({
        displayName: name.trim(),
        bio: introduction.trim() || null,
        interests: [program.trim()],
      });
      onContinue();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Your profile could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="entry-screen setup-screen">
      <section className="setup-panel">
        <div className="step-track" aria-label="Profile setup step 1 of 2"><span className="done" /><span /></div>
        <p className="entry-kicker">PROFILE · 1 OF 2</p>
        <h1>Introduce the useful part of you.</h1>
        <p className="login-copy">Your verified identity fields are not assumed public. Choose the limited profile information people need for a service.</p>
        <form className="service-form" onSubmit={submit} noValidate>
          <label>Display name<input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="How students should address you" /></label>
          <label>Program or area of study<input maxLength={50} value={program} onChange={(event) => setProgram(event.target.value)} placeholder="e.g. Computer science" /></label>
          <label>Short introduction<textarea rows={3} maxLength={180} value={introduction} onChange={(event) => setIntroduction(event.target.value)} placeholder="Skills, languages, or the kind of help you offer" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Continue"} {!saving && <ArrowRight size={16} />}</button>
        </form>
      </section>
    </main>
  );
}

function PrivacySetup({ onContinue }: { onContinue: () => void }) {
  const [permission, setPermission] = useState<"unknown" | "asking" | "allowed" | "denied">("unknown");

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setPermission("denied");
      return;
    }
    setPermission("asking");
    navigator.geolocation.getCurrentPosition(
      () => setPermission("allowed"),
      () => setPermission("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }
  return (
    <main className="entry-screen setup-screen privacy-setup">
      <section className="setup-panel setup-panel-wide">
        <div className="step-track" aria-label="Profile setup step 2 of 2"><span className="done" /><span className="done" /></div>
        <div className="privacy-layout">
          <div className="privacy-diagram" aria-hidden="true"><span className="zone-ring ring-one" /><span className="zone-ring ring-two" /><HitMeUpLogo size={54} /></div>
          <div>
            <p className="entry-kicker">LOCATION · 2 OF 2</p>
            <h1>Nearby, not pinpointed.</h1>
            <p className="login-copy">Location helps order nearby services. Before acceptance, everyone sees only an approximate area.</p>
            <div className="entry-proof-list compact">
              <span><MapPinned size={17} /> Public discovery: approximate zone</span>
              <span><LockKeyhole size={17} /> Accepted service: each person chooses whether to share</span>
              <span><ShieldCheck size={17} /> Completion: exact sharing expires</span>
            </div>
            {permission === "denied" && <p className="permission-note" role="status">Location is off. You can continue and search manually. You can enable it later in your browser settings.</p>}
            <div className="setup-actions">
              <button className="primary-action" type="button" disabled={permission === "asking"} onClick={requestLocation}><LocateFixed size={16} /> {permission === "allowed" ? "Location allowed" : permission === "asking" ? "Checking location…" : "Allow location"}</button>
              <button className="secondary-button" type="button" disabled={permission === "asking"} onClick={() => setPermission("denied")}>Not now</button>
            </div>
            <button className="text-button" type="button" onClick={onContinue}>{permission === "allowed" ? "Open the map" : "Continue without location"} <ArrowRight size={16} /></button>
          </div>
        </div>
      </section>
    </main>
  );
}
