# Laura avatar assets

The files in `characters/` and `accessories/` are lossless PNG cut-outs of Laura's actual artwork from Git ref `refs/remotes/cursor-source/merge-laura-avatar-marketplace-616f`.

- Source atlases: the nine PNGs under that ref's `public/avatar-customizer/assets/` directory.
- Extraction: `scripts/extract-laura-avatar-assets.py` applies the same matte-removal thresholds as Laura's original canvas prototype, trims transparent margins, and records source/output SHA-256 hashes in `manifest.json`.
- Runtime: the React marketplace reads only these extracted assets. The deleted standalone studio, iframe, local storage state, and client-owned premium preview are not shipped.
- Commerce: unlock and equip authority remains the authenticated backend. Manifest tiers are presentation metadata only.
