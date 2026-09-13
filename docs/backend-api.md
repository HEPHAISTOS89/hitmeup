# HitMeUp backend contract

HitMeUp uses a same-origin Next.js BFF. Auth0 SDK v4 owns `/auth/login`, `/auth/callback`, and `/auth/logout` with Authorization Code + PKCE, state/nonce, and encrypted HttpOnly session cookies. `GET /api/session` returns only a minimal verified-session projection.

A server request is accepted only when the Auth0 session contains all of: `role=authenticated`, `email_verified=true`, an exact allowlisted `.edu` domain, an approved Microsoft strategy (`waad` or `windowslive` by default), and the configured Microsoft tenant when `AUTH0_MICROSOFT_TID` is set. The Post Login Action in `integrations/auth0/post-login-edu-check.js` creates those claims. The application never receives or stores a Microsoft password.

All mutations reject untrusted browser origins and use bounded JSON bodies. A fast process-local guard is backed in production by the atomic `consume_api_rate_limit` Supabase RPC, keyed only by an HMAC pseudonym so limits hold across workers. Critical lifecycle and profile writes execute through checked Supabase RPCs; direct table mutation grants are revoked.

## Operational data routes

All routes below require a verified session.

| Method | Route | Contract |
|---|---|---|
| `GET` | `/api/data/services` | Public active offers. Filters: `category`, `q`, `minRating`, `maxDistanceMiles`. Only server-derived approximate coordinates; no Auth0 subject, email, wallet, or exact point. |
| `POST` | `/api/data/services` | Create one one-off offer. Body: `title`, `category`, `description`, `priceNote`, `availabilityNote`, optional `scheduledFor`, and `exactPoint`. The DB derives the public approximation. Returns `{id}`. |
| `PUT` / `DELETE` | `/api/data/services/:serviceId` | Provider-only full replacement or safe deactivation. |
| `GET` / `POST` | `/api/data/requests` | List the current user's projected requests, or request an active service with `{serviceId}`. No requester/provider subject is returned. POST returns `{id}`. |
| `PATCH` | `/api/data/requests/:requestId/status` | `{status}` is one of `accepted`, `rejected`, `cancelled`, `meeting`. Provider-only accept/reject; cancellation and state rules are enforced in the DB. Acceptance locks the one-off offer and rejects competing pending requests. Meeting requires two active location consents. Returns `{status}`. |
| `GET` / `POST` | `/api/data/requests/:requestId/messages` | Participant-only projected chat or `{body}` up to 2,000 characters. Messages identify `isMine` and a display name, never a sender subject. POST returns `{id}`. |
| `GET` | `/api/data/requests/:requestId/messages/stream` | Authenticated participant-only near-real-time SSE stream. Emits `messages` snapshots about every 1.25 seconds, keep-alives and a safe `stream-error`, then reconnects after a bounded cycle. No Supabase token or sender subject reaches the browser. |
| `GET` / `POST` / `DELETE` | `/api/data/requests/:requestId/location` | Read mutually shared exact location, grant temporary consent with optional `{expiresAt}`, or revoke the caller's consent. `GET` has no body. Exact location is unavailable before acceptance, after either revocation/expiry, or after bilateral completion/terminal status. |
| `POST` | `/api/data/requests/:requestId/completion` | Idempotent participant confirmation. The first creates `completion_pending`; the second creates `rating_pending`. Returns `{complete}`, true only after both. |
| `POST` | `/api/data/requests/:requestId/ratings` | `{score, comment?}`. One rating per participant; the request closes only after both. Returns `{id}`. |
| `GET` / `PATCH` | `/api/data/profile` | Read or update the current user's own public profile and interests. The optional Solana wallet is read here but can be changed only through the signed wallet-link flow. Historical `avatarConfig` data remains compatible; the visible Laura look comes from the marketplace loadout below. |
| `GET` / `PATCH` | `/api/data/notifications` | Read projected notifications or mark selected/all current-user notifications read. |
| `GET` | `/api/data/recommendations` | Explainable deterministic ranking using profile interests, adjusted rating, approximate campus distance and completion reliability. It is not presented as a trained ML model. |
| `GET` / `PATCH` | `/api/data/avatar-marketplace` | Read Laura's active server catalogue plus ownership/equipped state, or equip/unequip an owned approved SKU. The retired generic cosmetics endpoint no longer exists. |
| `GET` / `POST` | `/api/data/rewards` | Read the current student's reward ledger summary or spend server-earned points on an eligible Laura collectible. |

An outstanding outbound rating blocks only the student attempting to offer, request, accept, or start another service. It does not prevent another student from sending a request to a provider who has not yet acted.

## Four integration boundaries

### Auth0

`src/proxy.ts` uses the official SDK-wide matcher so auth routes and session refreshes execute. The local Action additionally restricts the login to Microsoft connection strategies and approved university domains. The deployed Preview completed a real TTU Microsoft callback and authenticated-session check. This proves the exercised Preview path only; it does not claim a separate Production Auth0/application deployment.

The Action uses `ALLOWED_EDU_DOMAINS`, `MICROSOFT_CONNECTION_STRATEGIES`, and optional `MICROSOFT_TENANT_ID` Action secrets. Their application-runtime equivalents are `ALLOWED_EDU_DOMAINS`, `AUTH0_MICROSOFT_STRATEGIES`, and optional `AUTH0_MICROSOFT_TID`.

### Gemini

`POST /api/integrations/gemini` accepts bounded service text and an optional bounded image data URL. The server key never reaches the browser. Structured JSON output is schema-constrained and then validated again. An absent key, timeout, malformed response, or unsafe category returns an explicitly labelled deterministic fallback. The legacy `/api/gemini/explain` route has the same auth/origin/body/rate controls.

### Solana

`POST /api/integrations/solana/quote` accepts `{productId}` and returns an authenticated Devnet quote with the catalogue SKU, label, exact lamports and public treasury address. `POST /api/integrations/solana/unlock` accepts the resulting wallet signature. The linked profile wallet fixes the payer. RPC `getTransaction` must return a confirmed slot with `meta.err === null`, a payer signer, and an exact System Program transfer to the configured treasury. A globally unique transaction signature is claimed through the admin-only DB RPC, so a receipt cannot unlock a second SKU/account. Service payments, escrow, withdrawals and Mainnet are out of scope.

### Tiger Data

`POST /api/integrations/tiger/events` accepts only the event and metadata allowlists. Unknown/sensitive fields are rejected, the Auth0 subject is replaced by a keyed HMAC pseudonym, and raw email/name/message/location/wallet data is never sent. With `TIGER_DATABASE_URL`, the server uses a small TLS PostgreSQL pool and parameterized INSERTs through `TigerPostgresStore`; the HTTPS ingest adapter is a disabled-by-default fallback. Apply `tiger/migrations/001_append_only_events.sql` to the Tiger dev database. Its trigger rejects UPDATE/DELETE.

Successful request, acceptance, bilateral completion, rating, and cosmetic-unlock server flows also append their corresponding Tiger events on a best-effort basis. Analytics outages never roll back or turn a completed operational write into a retryable error.

## Conversation stream

The chat stream deliberately terminates Supabase access at the same-origin BFF. This avoids granting browser-level table subscriptions that could expose internal Auth0 subjects. It is a bounded SSE polling stream rather than a direct database WebSocket, so it provides safe near-real-time delivery but does not claim sub-second push guarantees.

## Migration order and external proof

The active **Development** migration sequence is:

1. `supabase/migrations/202609120001_hitmeup_core.sql`
2. `supabase/migrations/202609120002_hitmeup_integrity.sql`
3. `supabase/migrations/202609120004_backend_contract.sql`
4. `supabase/migrations/202609120005_profile_experience.sql`
5. `supabase/migrations/20260913042018_harden_advisor_findings_without_contract_change.sql`
6. `supabase/migrations/20260913064227_marketplace_taxonomy.sql`

The production-only ledger repair is intentionally not in that sequence. Its
exact SQL snapshot is retained at
`supabase/repairs/20260913040702_repair_manually_applied_hitmeup_history.sql` as
an audit artifact for the historical Production reconciliation. It must not be
passed to the normal Supabase migration runner or replayed on Development.

Tiger Data has its separate migration at `tiger/migrations/001_append_only_events.sql`.

All six active Development migrations were applied to Supabase project
`olifkkohqhkcottaiqbs`. A rollback-only two-student smoke transaction exercised
service creation, request acceptance, chat, mutual location sharing, bilateral
completion, and bilateral ratings without retaining QA rows. At verification time
the `supabase_migrations.schema_migrations` ledger was absent, so there is no
ledger-based proof of the applied versions; do not interpret that absence as proof
that the schema is empty.

After explicit production authorization, the first four files were applied in one transaction on 2026-09-12 to Supabase project `audoriergtssfvarbeiy`, branch `main` (`PRODUCTION`). The first two attempts found a PostgreSQL numeric-round typing defect and then a parenthesis defect in the recommendation projection; each attempt rolled back completely, the source migration was corrected, and the final transaction committed. Postflight checks confirmed the 11 expected tables, RLS on all of them, 17 public-schema policies, PostGIS, authenticated-only received-review execution, blocked raw profile reads, and the recommendation/profile RPCs.

The linked Supabase migration API subsequently initialized and repaired `supabase_migrations.schema_migrations`. The recorded Production history contains the four applied schema versions, the production-only `20260913040702_repair_manually_applied_hitmeup_history` ledger entry, `20260913042018_harden_advisor_findings_without_contract_change`, and `20260913064227_marketplace_taxonomy`. The repair entry is represented in source control only by the audit artifact above; it is not an active Development migration. Before the marketplace migration was applied, the complete file succeeded inside a rollback-only Production transaction and the three new columns were confirmed absent after rollback. Post-application checks confirmed the new columns, checked RPC overloads, and reviewed-listing trigger. A second rollback-only smoke transaction proved valid temporary-listing creation and public projection, rejected an invalid taxonomy, and left zero QA profiles and services.

The hardening migration preserves the application RPC contract while making `public_profiles` a working security-invoker projection backed only by column-level grants for its already-public fields. Email, wallet, and other private columns remain blocked. Direct execution of the row/event-trigger helpers is revoked, the rate-limit table has an explicit restrictive client deny policy, overlapping service policies are split without changing their effective conditions, and all eight Advisor-reported foreign-key indexes are present. PostGIS function revocation resolves the installed extension schema at runtime: the recorded Production project uses `public`, while Development uses `extensions`. A post-migration query verified every one of those invariants; the current Production ledger contains seven entries, including the historical repair.

Supabase Advisor still reports platform-owned PostGIS objects in the recorded Production `public` schema: `spatial_ref_sys` and the three `st_estimatedextent` overloads. PostGIS is non-relocatable on this project, `spatial_ref_sys` is owned by `supabase_admin`, and the migration role cannot alter it. Reinstalling or taking ownership would risk the live geography columns and was intentionally rejected. Development installs PostGIS in `extensions`; the hardening migration handles that schema without moving or recreating the extension. Advisor also lists the authenticated `SECURITY DEFINER` application RPCs by design; they remain executable because they are the checked API boundary and revoking them would break the product. Newly created indexes remain marked unused until real traffic exercises them.

A remote Development audit confirmed the Tiger service is ready, its TLS connection succeeds, and append/readback plus invalid-event rejection behave as intended. The server Supabase secret was refreshed in Vercel Preview and Development, followed by a new deployment; the deployed Preview loaded stably. Auth0/Microsoft and Supabase third-party auth are configured separately from database-schema proof, and the TTU browser callback/session was proven on that Preview. The dedicated Production application remains unconfigured and undeployed. Runtime secrets belong in hosted secret storage; this workspace intentionally contains no `.env` or `.env.local` file.
