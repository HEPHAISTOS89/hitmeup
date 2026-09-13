# Avatar marketplace, rewards, and Solana contract

## Product decisions

These values are HitMeUp hackathon decisions, not values supplied by Laura's visual branch:

- a verified two-student service lifecycle grants **50 non-cash HitMeUp points to each participant** only after the request entered `meeting`, both students confirmed completion, and both ratings closed it;
- the Laura premium avatar collection is one **0.05 SOL Devnet** test-token bundle (`avatar-premium-collection`);
- reward items cost 40–100 earned points;
- the original three SVG collectibles keep their existing 0.01/0.02/0.03 SOL Devnet prices.

Devnet SOL has no real monetary value. This demonstrates a treasury payment and entitlement flow, not production revenue. Student-to-student service payments remain off-platform.

## Production rollout order

Apply the database migration before deploying the new application build. The migration keeps the previous profile-save RPC available without allowing direct wallet writes, and temporarily keeps the previous four-argument Solana claim RPC for the three original fixed-price SVG products. That legacy bridge is service-role-only and must be removed after every production instance uses quote-bound checkout IDs.

Before applying the migration, verify that existing non-null wallet addresses are unique; the migration intentionally stops rather than merging identities. It preserves valid in-flight meetings and completion/rating states only when the historical state proves a meeting, carries forward equipped legacy SVG products, and deliberately does not grant points retroactively for already-closed services.

## Asset boundary

The `avatar.*` option IDs are backed by deterministic original HitMeUp SVGs generated in this repository. Their manifest records 54 character combinations, 15 accessories, 12 backgrounds, file hashes, and zero third-party image inputs; these entries are therefore `assetStatus: "approved"`. The former Laura raster atlases are not distributed or read by the generator.

The existing six-field `avatarConfig` remains unchanged for rolling compatibility. The new server loadout is stored by equipped SKU; do not use localStorage or a client-side `premium` boolean as ownership.

## Read catalogue

`GET /api/data/avatar-marketplace`

```json
{
  "items": [{
    "sku": "avatar.background.burst",
    "label": "Noise burst",
    "category": "background",
    "value": "burst",
    "equipGroup": "background",
    "collections": ["male", "female"],
    "unlockMethod": "solana_devnet",
    "purchaseSku": "avatar-premium-collection",
    "lamports": 50000000,
    "rewardPoints": 0,
    "owned": false,
    "equipped": false,
    "network": "devnet",
    "assetStatus": "approved"
  }]
}
```

`unlockMethod` determines the only valid UI action:

- `included`: already owned, can equip immediately;
- `reward_points`: call the reward unlock endpoint, then refresh catalogue;
- `solana_devnet`: quote and pay `purchaseSku`, never the visual item's `sku`; after verification, refresh catalogue.

Items sharing one `equipGroup` replace each other. Separate accessory groups stack.

## Equip or unequip

`PATCH /api/data/avatar-marketplace`

```json
{ "sku": "avatar.accessory.frames", "equipped": true }
```

Response:

```json
{ "sku": "avatar.accessory.frames", "equipped": true }
```

The database rejects unknown, unowned, collection-incompatible, or non-approved items. For `equipped: false`, only that exact item is removed. Changing collection also removes incompatible loadout entries.

## Rewards

`GET /api/data/rewards`

```json
{
  "rewards": {
    "balance": 50,
    "lifetimeEarned": 50,
    "lifetimeSpent": 0,
    "unlockedSkus": []
  }
}
```

`POST /api/data/rewards`

```json
{ "sku": "reward-frame-mint" }
```

The server derives the current student, locks the profile row, reads the backend price, checks the ledger balance, writes one negative idempotent ledger entry, and creates ownership atomically. The browser never sends a point amount. Insufficient balance returns HTTP 409 with `code: "insufficient_points"`.

Points cannot be earned from views, filters, chats, location sharing, request creation, acceptance, one-sided completion, one-sided rating, Tiger events, or Solana purchases. A student can receive rewards for at most three closed services per UTC day; each request is idempotent.

## Solana Devnet paid unlock

For any paid catalogue item:

1. connect an injected Phantom/Solflare wallet; never request a seed phrase or private key;
2. call `POST /api/integrations/solana/wallet/challenge` with the public key, sign the exact UTF-8 message in-wallet, Base58-encode the 64-byte signature, then call `POST /api/integrations/solana/wallet/link`; direct profile wallet assignment is rejected;
3. call `POST /api/integrations/solana/quote` with the item's `purchaseSku` and the client helper's session-scoped `checkoutKey`; the server checks the active database price and existing entitlement, and returns a subject-bound `checkoutId` reservation valid for 60 minutes. The same browser session can resume it, while a different checkout is rejected before wallet signing;
4. transfer the exact quoted lamports on Devnet;
5. call `POST /api/integrations/solana/unlock` with the same `purchaseSku`, `checkoutId`, and transaction signature;
6. the server verifies confirmed slot, payer signer, exact treasury, exact amount, and the database rechecks the product price plus reservation before recording one unique entitlement; exact receipt retries are idempotent;
7. refresh `/api/data/avatar-marketplace`, then equip the visual SKU.

The quote, verifier, SQL claim allowlist, and catalogue are aligned for:

- `avatar-premium-collection` — 50,000,000 lamports;
- `profile-frame` — 10,000,000 lamports;
- `campus-theme` — 20,000,000 lamports;
- `trust-badge` — 30,000,000 lamports.

## Recommendation contract

`GET /api/data/recommendations` now returns the same complete public service DTO as discovery plus `score` and `explanation`, ordered by server score. The score uses selected category/subcategory interests, Bayesian adjusted rating, approximate campus distance, and completed services. Missing response-time data receives no fabricated boost. The client helper is `getRecommendations()`.

Gemini discovery normalizes structured radius/rating/time phrases before the literal service query, and Gemini explanations are capped to 24 words after generation.
