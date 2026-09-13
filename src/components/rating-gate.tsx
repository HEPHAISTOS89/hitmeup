"use client";

import { useEffect, useRef } from "react";
import { Star } from "lucide-react";

export function RatingGate({ name, value, onChange, onSubmit, busy, error }: {
  name: string; value: number; onChange: (value: number) => void;
  onSubmit: () => void; busy: boolean; error?: string;
}) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => { card.current?.focus(); }, [name]);
  return <div className="rating-gate">
    <section ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="required-rating-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
        if (event.key === "Tab") {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <span className="rating-gate-icon"><Star size={26} /></span>
      <h1 id="required-rating-title">One last thing.</h1>
      <p>Your task is complete. Rate your experience with <strong>{name}</strong> to continue using HitMeUp.</p>
      <div className="rating-gate-stars" role="group" aria-label="Your rating">
        {[1,2,3,4,5].map((star) => <button key={star} type="button" disabled={busy} aria-label={`${star} stars`} aria-pressed={value === star} onClick={() => onChange(star)}><Star size={30} fill={star <= value ? "currentColor" : "none"} /></button>)}
      </div>
      <small>{value ? `${value} out of 5` : "Choose 1–5 stars. Any honest rating is welcome."}</small>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="primary-action" type="button" disabled={busy || value < 1 || value > 5} onClick={onSubmit}>{busy ? "Submitting…" : "Submit rating & continue"}</button>
      <small>Both students are asked to rate. You unlock your access by submitting yours.</small>
    </section>
  </div>;
}
