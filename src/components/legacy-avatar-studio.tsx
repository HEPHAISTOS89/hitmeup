"use client";
import { useEffect, useRef, useState } from "react";

export function LegacyAvatarStudio() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1050);
  const [documentHtml, setDocumentHtml] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/avatar-customizer/index.html", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Editor unavailable"); return response.text(); })
      .then((html) => setDocumentHtml(html.replace("<head>", '<head><base href="/avatar-customizer/">')))
      .catch((error) => { if (error.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.type !== "avatar-studio-height") return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next)) setHeight(Math.max(600, Math.min(5000, next)));
    };
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, []);
  return <section className="restored-avatar-studio" aria-label="Avatar customization">
    {failed && <p role="alert">The avatar editor could not load. Please reload to try again.</p>}
    {!documentHtml && !failed && <p role="status">Loading your avatar studio…</p>}
    {documentHtml && <iframe
      ref={frame}
      title="HitMeUp avatar customization — outfits, faces, accessories and backdrops"
      srcDoc={documentHtml}
      style={{ display: "block", width: "100%", height, border: 0, borderRadius: "16px", background: "#fbfaf8" }}
    />}
  </section>;
}
