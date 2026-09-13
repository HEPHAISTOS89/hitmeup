# Contributing to HitMeUp

Thanks for helping improve HitMeUp. Keep contributions focused, reviewable, and safe
for a shared student marketplace.

## Start a branch

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
```

Do not commit directly to `main`. Open a pull request and explain the user-facing
change, affected contracts, and verification performed.

## Local setup

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Use `.env.example` only as a list of variable names. Keep credentials in your own
local or hosted secret store and never paste them into issues, commits, screenshots,
or pull requests.

## Required checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For interface changes, also inspect the affected flow on desktop and mobile. A build
alone does not prove that the interaction or responsive layout works.

## Project guardrails

- Preserve approximate public locations and bilateral exact-location consent.
- Keep authenticated data operations behind the existing server and RPC boundaries.
- Do not enable production writes, payments, or deployments from a local change.
- Never present permanent business placement as organic student endorsement.
- Keep preview fixtures clearly labelled and unavailable in production.
- Add or update focused tests when changing a contract or user flow.

## Pull requests

Prefer one coherent change per pull request. Include screenshots for visual work and
call out any external setup that remains pending or unverified.
