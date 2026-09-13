# Avatar marketplace, rewards, and Solana contract

## Product decisions

These values are HitMeUp hackathon decisions, not values supplied by Laura's visual branch:

- a verified two-student service lifecycle grants **50 non-cash HitMeUp points to each participant** only after the request entered `meeting`, both students confirmed completion, and both ratings closed it;
- the Laura premium avatar collection is one **0.05 SOL Devnet** test-token bundle (`avatar-premium-collection`);
- Laura's Night beanie costs 40 earned points, Crossbody bag costs 60, and the collection-specific Wallet chain and Star earrings cost 80 each;
- the retired profile frame, campus theme, trust badge, reward frames, reward patch and reward motion are not part of the active catalog.

Devnet SOL has no real monetary value. This demonstrates a treasury payment and entitlement flow, not production revenue. Student-to-student service payments remain off-platform.

## Production rollout order

Apply both database migrations, in filename order, before deploying the new application build. The second migration makes Laura's inventory the sole active catalog, disables new quotes for the three retired Solana products, and preserves their historical receipts and entitlements as inactive audit records. It does not delete purchase or reward history.

Before applying the migrations, verify that existing non-null wallet addresses are unique; the first migration intentionally stops rather than merging identities. It preserves valid in-flight meetings and completion/rating states only when the historical state proves a meeting and deliberately does not grant points retroactively for already-closed services. The catalog cleanup deactivates retired visuals rather than deleting their rows.

## Asset boundary

The active `avatar.*` option IDs use Laura's actual project-supplied raster artwork. `public/avatar/laura/manifest.json` records the approved Cursor source ref, hashes for the nine source atlases, and hashes/dimensions for 54 losslessly extracted character PNGs and 15 accessory PNGs, plus 12 background definitions. The application reads those cut-outs directly; it does not procedurally redraw Laura's characters or accessories. No former frame, patch, motion, profile-frame, campus-theme, or trust-badge visual is exposed by the active catalog or marketplace UI.

The existing six-field `avatarConfig` remains unchanged for rolling compatibility. The new server loadout is stored by equipped SKU; do not use localStorage or a client-side `premium` boolean as ownership.

## Read catalogue

`GET /api/data/avatar-marketplace`

```json
{
  "items": [{
    "sku": "avatar.accessory.beanie",
    "label": "Night beanie",
    "category": "accessory",
    "value": "beanie",
    "equipGroup": "accessory:headwear",
    "collections": ["male", "female"],
    "unlockMethod": "reward_points",
    "purchaseSku": null,
    "lamports": 0,
    "rewardPoints": 40,
    "owned": false,
    "equipped": false,
    "network": null,
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
{ "sku": "avatar.accessory.beanie" }
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

The quote, verifier, SQL product row, and active catalog are aligned on one purchase product:

- `avatar-premium-collection` — 50,000,000 lamports.

That entitlement owns every active Laura item whose `purchaseSku` is `avatar-premium-collection`; it never owns reward-point accessories. The inactive `profile-frame`, `campus-theme`, and `trust-badge` rows cannot receive new quotes.

## Recommendation contract

`GET /api/data/recommendations` now returns the same complete public service DTO as discovery plus `score` and `explanation`, ordered by server score. The score uses selected category/subcategory interests, Bayesian adjusted rating, approximate campus distance, and completed services. Missing response-time data receives no fabricated boost. The client helper is `getRecommendations()`.

Gemini discovery normalizes structured radius/rating/time phrases before the literal service query, and Gemini explanations are capped to 24 words after generation.
