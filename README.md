<div align="center">
  <img src="public/brand/logo-mark.svg" alt="HitMeUp logo" width="104" />

  # HitMeUp

  **The campus around you, ready when you are.**

  A privacy-first marketplace for spontaneous plans, student help, short gigs,
  campus activities, and reviewed local businesses.

  [![Next.js](https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tests](https://img.shields.io/badge/tests-140%20passing-20A464)](#verified-locally)
  [![License](https://img.shields.io/badge/license-MIT-E7011F)](LICENSE)
</div>

---

## What HitMeUp does

HitMeUp turns a campus map into a trusted exchange between verified students.
People can discover what is happening nearby without publishing an exact address,
then coordinate privately once a request is accepted.

### Browse by intent

| | Category | Examples |
|---|---|---|
| 🎉 | **Social** | Hangouts, pickup games, study groups, spontaneous food plans |
| 🛠️ | **Services** | Moving, photography, hair and nails, cleaning, tech help |
| 📚 | **Tutoring** | Homework support, exam prep, languages, coding help |
| 💼 | **Jobs** | Campus gigs, event staffing, short-term paid work |
| 🤝 | **Volunteer** | Cleanups, donation drives, community projects |
| 🎨 | **Clubs** | Gaming, art, music, coding, books, chess |
| 🏃 | **Activities** | Basketball, soccer, running, hiking, gym partners |
| 🎟️ | **Events** | Campus events, workshops, concerts, pop-ups |
| 🏪 | **Businesses** | Reviewed permanent pins with clear sponsorship labels |
| 🚨 | **Help** | Borrowing an item, carrying something, quick requests |

### Two listing modes

- **Temporary posts** are created by students for immediate or scheduled needs.
- **Permanent pins** are reserved for reviewed businesses and always labelled as
  sponsored. Pricing and checkout are intentionally not presented as active until
  a real payment provider and backend flow are configured and verified.

## Product principles

- **Approximate by default:** public discovery never exposes an exact meeting point.
- **Consent before precision:** exact location sharing is scoped to accepted requests
  and requires both participants.
- **Verified campus access:** the intended live flow uses university Microsoft login.
- **Sponsorship without disguise:** paid business placement cannot masquerade as a
  student recommendation.
- **Useful when integrations fail:** deterministic fallbacks and explicit offline
  states preserve the core experience.

## Run locally

### Requirements

- Node.js 22+
- pnpm 11+

```bash
git clone https://github.com/HEPHAISTOS89/CrackX-HitMeUp.git
cd CrackX-HitMeUp
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000/app?preview=1](http://localhost:3000/app?preview=1)
for the clearly labelled, in-memory preview experience. Preview mode is disabled in
production.

## Verified locally

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The repository was published with TypeScript and ESLint clean, **140 tests passing**,
and a successful Next.js production build.

## Architecture

- **Interface:** Next.js 16, React 19, TypeScript, Tailwind CSS, Lucide icons
- **Map:** MapLibre GL with OpenFreeMap styles and a deliberate offline fallback
- **Identity:** Auth0 with university-domain admission and Microsoft login
- **Operational data:** Supabase Postgres, PostGIS, RPC contracts, and RLS
- **Realtime:** same-origin SSE participant chat
- **Assistance:** Gemini classification with a deterministic fallback
- **Analytics:** append-only pseudonymous events for Tiger Data
- **Optional cosmetics:** Solana Devnet wallet flow, isolated from service payments

See [`docs/backend-api.md`](docs/backend-api.md) for API contracts and
[`docs/technical-status.md`](docs/technical-status.md) for the detailed environment,
migration, and integration status.

## Environment and secrets

Copy variable names from `.env.example`, but keep all real credentials in the hosted
secret store. Never commit `.env`, `.env.local`, private keys, recovery material, or
production credentials.

## Team

- **Ryan Sepkap** — [`@HEPHAISTOS89`](https://github.com/HEPHAISTOS89)
- **Laura Ferrer** — [`@Nyicris`](https://github.com/Nyicris)
- **Isaac Akowanou** — [`@isaacakowanou`](https://github.com/isaacakowanou)

## Contributing

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a branch or pull
request. Small, reviewable changes and passing checks keep the project easy to share.

---

<div align="center">
  <strong>Built by CrackX for students who need the right people nearby.</strong>
</div>
