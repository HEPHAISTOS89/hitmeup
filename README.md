# HitMeUp

Privacy-first campus services marketplace for verified students. The current build
is a responsive production-oriented web portal with an interactive campus map, service
filters, request chat, consent-gated locations, walking/driving directions,
two-party completion, and required bilateral ratings.

## Stack

- Next.js 16, React 19, TypeScript and Tailwind CSS
- MapLibre GL JS 6.9.0 with key-free OpenFreeMap vector styles
- Supabase Postgres and RLS (production schema and migration ledger synchronized on project `audoriergtssfvarbeiy`)
- Same-origin SSE conversation stream over participant-safe message projections
- Auth0 student-domain Action (prepared; hosted tenant configuration remains external)
- Gemini recommendation explanation route with a deterministic fallback
- Solana Devnet reserved for optional cosmetic profile unlocks

## Map provider

The discovery surface uses the pinned `maplibre-gl` npm package and the public
OpenFreeMap Liberty/Dark vector styles. No API key or external script tag is
required. The defaults can be replaced at build time with explicit HTTPS or
same-origin values in `NEXT_PUBLIC_MAP_STYLE_LIGHT_URL` and
`NEXT_PUBLIC_MAP_STYLE_DARK_URL`. OpenFreeMap and OpenStreetMap attribution is
rendered inside the map. MapLibre's worker and matching shared module are
self-hosted from `public/vendor/maplibre/` because Next.js Turbopack otherwise
resolves the package-relative worker URL to HTML instead of JavaScript. These
vendored files must be updated together whenever `maplibre-gl` is upgraded.
Missing decorative POI icons in an upstream style are resolved to a transparent
placeholder; HitMeUp's interactive service markers remain separate DOM controls.

Theme changes swap the map style without discarding the selected service. If the
browser is offline, the style cannot load, or WebGL initialization fails, the app
shows a deliberate campus directory/diagram where every service remains
selectable. All public marker positions remain approximate; exact meeting points
still require the existing mutual-consent flow. Accepted requests can open
privacy-gated directions in Google Maps without embedding its SDK.

The loading gate follows MapLibre's first visually complete `load` event rather
than the stricter `idle` event, so a slow or failed individual tile cannot hide an
otherwise usable map. Later theme swaps use `style.load`; a bounded timeout still
activates the directory fallback when the complete style never becomes usable.

## Local verification

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The app is intentionally not started or deployed by setup. `pnpm dev` starts the
local development server when the team is ready to review the interface.

## Secrets

No secret is committed to this repository, and this workspace intentionally has
no `.env` or `.env.local` file. `.env.example` documents public values and
variable names only. Real credentials must be injected by the hosted runtime's
secret store; do not recreate a local secret file.

Operational product data is remote-only: Supabase is the system of record and
Tiger is an append-only, pseudonymous analytics sink. There is no SQLite,
filesystem or browser-storage fallback for accounts, services, requests,
messages, locations, ratings or reviews. The non-production `?preview=1` route
uses clearly labelled in-memory fixtures and is disabled in production. Browser
storage contains only the non-sensitive color-theme preference and, after a
wallet submits a Devnet transfer, the public transaction signature plus its quote
fields until the server unlock succeeds. It never contains a seed phrase,
private key, auth token, or wallet signing material.

## External setup status

- Supabase: after explicit production authorization, migrations
  `202609120001`, `202609120002`, `202609120004`, and `202609120005` were
  applied atomically on 2026-09-12 to project `audoriergtssfvarbeiy`, branch
  `main` (`PRODUCTION`). Independent postflight checks confirmed all 11 expected
  tables, RLS on every table, 17 public-schema policies, PostGIS, the discovery
  and profile RPCs, authenticated-only review access, and blocked direct
  authenticated reads of raw profiles. The linked Supabase migration API then
  reconciled the four manually applied versions and recorded
  `20260913040702_repair_manually_applied_hitmeup_history`. Remote migration
  history lists that repair plus
  `20260913042018_harden_advisor_findings_without_contract_change`; all six
  source-controlled files have remote statement lengths matching locally.
  The hardening pass made the safe profile view security-invoker, denied client
  access to rate-limit rows and trigger helpers, consolidated service policies,
  and added all eight missing foreign-key indexes without changing the app RPC
  contract.
- Gemini: the server adapter and deterministic fallback are tested locally; no
  live Gemini credential or provider call has been verified here.
- Auth0: the tenant and local Authorization Code + PKCE redirect were inspected.
  The Microsoft university connection and the stricter `.edu` admission Action
  are not yet deployed/proven end to end.
- Solana: Devnet receipt verification is covered by local contract tests; no
  configured treasury or real cosmetic transaction has been verified here.
- Tiger Data: a remote HitMeUp Development service is ready. A read-only check
  confirmed the append-only analytics table and existing events. Runtime access
  still depends on hosted secret injection; nothing is read from `.env.local`.
- Domain: `hitmeup.tech` is pending teammate DNS access and currently must not be
  treated as a live application URL.
- Vultr: do not provision resources until promotional-credit access is verified.

## Integration boundaries

- `POST /api/integrations/gemini` requires a verified student session and returns
  structured service suggestions. If Gemini is unavailable, it returns an explicit
  deterministic fallback; the server-only key is never sent to the browser.
- `POST /api/integrations/solana/unlock` accepts only confirmed **Devnet** signatures
  paying the configured treasury and product amount, from the wallet linked to the
  authenticated profile. The final idempotent claim uses the server-only
  `SUPABASE_SECRET_KEY`; it never handles service
  payments, escrow, withdrawals, or mainnet transactions.
- Avatar Studio can connect an injected Phantom, Solflare, or compatible wallet,
  link only its public address to the authenticated profile, and submit the exact
  server quote as a Devnet System Program transfer. The signature is saved as soon
  as it is returned so a failed unlock can be retried without paying twice. Manual
  signature entry remains available as a fallback. The browser never asks for or
  handles seed phrases or private keys. A browser-wide exclusive checkout lock
  prevents two HitMeUp tabs from submitting wallet payments concurrently; when
  that safety primitive is unavailable, the integrated payment fails closed and
  leaves the manual signature fallback available.
- `POST /api/integrations/tiger/events` is disabled unless
  `TIGER_DATA_ENABLED=true` and either a TLS PostgreSQL URL or an HTTPS ingest
  endpoint/key is configured. It exposes append-only POST events and never
  mutates the operational database.
- Auth0 admission is enforced by `src/lib/auth0.ts` and the Post Login Action in
  `integrations/auth0`; both require `email_verified` and an approved `.edu` domain.
- Supabase access is centralized in `src/lib/supabase/factory.ts`: browser code can
  use only the publishable key, while server requests optionally forward the Auth0
  **ID token**; missing ID token fails closed with a controlled 503. Supabase
  Third-party Auth must be configured for the Auth0 issuer (`https://AUTH0_DOMAIN/`),
  the Auth0 application client ID as audience, RS256 signing, the literal
  `role: authenticated` ID-token claim, and the `sub` claim.
  Critical lifecycle mutations go through validated RPCs exposed by the
  `/api/data` routes; exact coordinates are returned only by the mutual-consent RPC.
- Production API abuse limits use an atomic Supabase RPC shared across instances.
  `RATE_LIMIT_SALT` (or the server-only `AUTH0_SECRET`) HMACs subjects before storage;
  missing shared protection fails closed rather than silently using one worker.
- The deployed migration sequence adds expiry-aware location consent,
  a non-reversible public point displaced 350–650 metres from the exact point,
  completion/rating state transitions, safe projections, notification reads,
  private received-review reads, and idempotent cosmetic claims keyed by Solana
  transaction signature.

## Database safety

The six files under `supabase/migrations` are the source-controlled definition
of the schema currently applied to the explicitly authorized Supabase production
project above. Future changes must remain reviewable migrations, be tested on a
disposable development database first, and receive explicit authorization before
any shared or production application.
