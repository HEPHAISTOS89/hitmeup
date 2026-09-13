# HitMeUp

Privacy-first campus services marketplace for verified students. The current build
is a responsive production-oriented web portal with an interactive campus map, service
filters, request chat, consent-gated locations, walking/driving directions,
two-party completion, and required bilateral ratings.

## Stack

- Next.js 16, React 19, TypeScript and Tailwind CSS
- MapLibre GL JS 6.9.0 with key-free OpenFreeMap vector styles
- Supabase Postgres and RLS (Development project `olifkkohqhkcottaiqbs`; Production project `audoriergtssfvarbeiy`)
- Same-origin SSE streams for participant-safe conversations, notifications,
  request state and approximate public service projections
- Auth0 student-domain Action plus Microsoft university login and Supabase third-party auth
- Gemini natural-language discovery, listing review and explainable recommendation
  routes with privacy-safe deterministic fallbacks
- Solana Devnet wallet flow reserved for optional cosmetic profile unlocks
- Tiger Data append-only, pseudonymous product events

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

- Vercel Production: the server-only and public Production variables are installed,
  the latest Production deployment completed successfully, and
  `hitmeup.tech`, `www.hitmeup.tech`, and `hitmeup-eight.vercel.app` are active
  aliases. All three returned HTTP 200 after deployment. No secret value is kept
  in this repository.
- Supabase Development: project `olifkkohqhkcottaiqbs` has the six active schema
  migrations, 11 RLS-protected tables, PostGIS under `extensions`, and the Auth0
  third-party authentication integration enabled for the HitMeUp tenant. A
  rollback-only two-student smoke transaction exercised service creation, request
  acceptance, chat, mutual location sharing, bilateral completion, and bilateral
  ratings without retaining QA rows. The Development schema was applied, but the
  `supabase_migrations.schema_migrations` ledger is absent, so this is not ledger
  proof of the applied versions.
- Supabase Production history: after explicit authorization, migrations
  `202609120001`, `202609120002`, `202609120004`, and `202609120005` were
  applied atomically on 2026-09-12 to project `audoriergtssfvarbeiy`, branch
  `main` (`PRODUCTION`). Independent postflight checks confirmed all 11 expected
  tables, RLS on every table, 17 public-schema policies, PostGIS, the discovery
  and profile RPCs, authenticated-only review access, and blocked direct
  authenticated reads of raw profiles. The linked Supabase migration API then
  reconciled the four manually applied versions and recorded the production-only
  ledger repair `20260913040702_repair_manually_applied_hitmeup_history`.
  Its SQL snapshot is retained under `supabase/repairs/` for audit and is not an
  active migration. Remote migration history lists that repair plus
  `20260913042018_harden_advisor_findings_without_contract_change` and
  `20260913064227_marketplace_taxonomy`; both are also kept in the active
  Development sequence. The marketplace migration was first exercised inside a
  rollback-only Production transaction, then applied through the linked migration
  API. A second rollback-only functional smoke check proved valid listing
  creation/projection, invalid-taxonomy rejection, and removal of all QA rows.
  The hardening pass made the safe profile view security-invoker, denied client
  access to rate-limit rows and trigger helpers, consolidated service policies,
  and added all eight missing foreign-key indexes without changing the app RPC
  contract. A comprehensive rollback-only two-student Production transaction also
  verified marketplace filtering/recommendations; accepted, rejected and cancelled
  requests; bidirectional chat; notification fan-out/read state; mutual location
  reveal, revocation and expiry; bilateral completion; ratings; the required-rating
  gate; aggregate projections; and complete rollback. A separate disposable
  authenticated fixture then proved that a new peer message appeared in the live
  Production conversation without a page reload; every fixture was deleted and the
  existing profile was restored afterward.
  A fresh Advisor pass found the application RPCs limited to authenticated callers
  with subject-bound checks, but still reports Supabase-owned PostGIS objects in
  `public`: `spatial_ref_sys` has no RLS and the three `st_estimatedextent`
  overloads retain client execute grants. Direct revocation from the project role
  had no effect because those objects are owned by `supabase_admin`. The CRS table
  is platform metadata, while the extent functions remain a bounded aggregate
  spatial-privacy risk to resolve through Supabase/platform ownership rather than
  by moving or reinstalling PostGIS in Production.
- Gemini: the credential and model are installed in Vercel Production as well as
  Preview/Development. Live model listing and structured generation returned HTTP
  200 during setup. The Production prompt now includes every exact category and
  subcategory pair and the schema includes the Businesses category, preventing a
  valid model response from being silently downgraded because the model had not
  received the taxonomy. The deployed `.tech` flow returned a validated Gemini
  suggestion for a disposable calculus draft after this correction; nothing was
  published. The adapter and explicit deterministic fallback are covered by local
  tests.
- Auth0: the HitMeUp application, Microsoft TTU connection, verified `.edu`
  admission Action, and Supabase third-party-auth bridge are configured. The
  callback, logout and web-origin allowlists include both Production `.tech`
  origins. A real TTU Microsoft Authorization Code + PKCE callback and authenticated
  Production session were proven on `hitmeup.tech`.
- Solana: the Devnet treasury and RPC settings are installed in Vercel Production,
  and wallet/receipt boundaries are covered by tests, including fail-closed rejection
  of a transaction without confirmation metadata. The treasury remains unfunded, so
  no real cosmetic transfer is claimed.
- Tiger Data: Development remains isolated on `hitmeup-development`
  (`lgfivhw0j9`, DEV), while Vercel Production now points only to the separately
  provisioned `hitmeup-production` service (`kkddvi1rzl`, PROD). The append-only
  event migration, owner-only access, TLS connection and a disposable pseudonymous
  append/readback were verified directly on the Production service. The browser
  submits only the approved categorical filter/view contract; the server derives
  and pseudonymizes the actor before storage. Both services currently use Tiger's
  free shared tier, so capacity, retention and billing must still be monitored.
- Domain: `hitmeup.tech` and `www.hitmeup.tech` resolve to the active Vercel
  Production deployment and are configured as canonical application origins.
- Vultr: do not provision resources until promotional-credit access is verified.

## Integration boundaries

- `POST /api/integrations/gemini` requires a verified student session and returns
  structured service suggestions including exact taxonomy, search tags, safety flags,
  and price/availability review notes. `POST /api/gemini/discover` translates one
  sentence into bounded category, subtype, distance, rating, time and listing-kind
  filters. `POST /api/gemini/explain` explains a ranking from public listing data,
  aggregate bands and explicitly approved coarse interests only. If Gemini is
  unavailable, every route returns an explicit deterministic fallback; exact
  coordinates, identity, private chat and the server-only key are never sent to the
  model or browser.
- `GET /api/data/live` requires the verified Auth0/Supabase session and exposes a
  same-origin SSE stream of the same safe notifications, request summaries and
  approximate service DTOs as the ordinary list routes. It polls in bounded
  intervals, sends heartbeats, closes after a bounded lifetime, and lets EventSource
  re-authorize on reconnect. Exact meeting points and raw database rows are excluded.
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
  mutates the operational database. Discovery emits only approved categorical
  filter/view metadata; actor identity is derived from the verified server session
  and pseudonymized before storage.
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

The files under `supabase/migrations` are the active Development sequence. They
are not a claim that every Development migration has been applied remotely, and
they are not a replay plan for Production. The production-only ledger repair is
kept separately at
`supabase/repairs/20260913040702_repair_manually_applied_hitmeup_history.sql` as
an immutable audit artifact; do not move it back into `supabase/migrations` or
apply it with the normal migration runner. Future schema changes must remain
reviewable migrations, be tested on a disposable Development database first, and
receive explicit authorization before any shared or Production application.
