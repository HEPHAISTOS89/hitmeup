# HitMeUp avatar vector manifest

This directory contains the production-safe replacement for the avatar artwork
prototype. The interaction model and stable catalog IDs are preserved, but the
visuals are original HitMeUp SVGs generated without Laura's raster atlases or
other third-party image inputs.

## Included

- 54 character combinations: two collections, three tops, three bottoms, and
  three expressions.
- 15 individually layered SVG accessories.
- 12 responsive CSS background definitions.
- `manifest.json` with stable IDs, layer geometry, free/premium presentation
  groups, output dimensions, and deterministic SHA-256 hashes.

Run `python3 scripts/extract-laura-avatar-assets.py` from the repository root to
regenerate the pack. The historical script name is retained for tooling
compatibility; the current script is a standalone procedural SVG generator.

## Rights and commerce boundary

The checked-in images are newly generated vector artwork for HitMeUp. No raster
bytes from Laura's branch are included or read by the generator. This is an
engineering provenance record, not external legal advice.

The `free` and `paid` tiers in the manifest are presentation metadata. The
authenticated backend catalog remains the source of truth for prices, reward
balances, ownership, unlocks, and equipped state. The client must never infer
ownership from this file or browser storage.
