# HitMeUp brand asset manifest

Original, transparent SVG assets for the HitMeUp web UI. The system uses a wordless relay/connection mark, coral-red identity color, black trust anchors, rounded geometry, and a small diamond handoff node. It intentionally avoids people or human imagery, hearts, dating cues, precise-address pins, university trademarks, text baked into graphics, and third-party marks.

`texas-tech-campus.jpg` is a cropped copy of “Texas Tech University April 2022 16 (Administration)” by Michael Barera, sourced from Wikimedia Commons under CC BY-SA 4.0. The login screen keeps this attribution in a compact information link instead of placing a text caption over the photograph.

| File | Intended UI role | ViewBox | Notes |
| --- | --- | --- | --- |
| `logo-mark.svg` | Default logo mark on light surfaces | `0 0 64 64` | Red/coral with a black relay node; legible at favicon/navigation sizes. |
| `logo-mark-dark.svg` | Logo mark on near-black surfaces | `0 0 64 64` | Brighter values and white relay node for dark UI. |
| `logo-mark-mono.svg` | One-color and CSS-controlled mark | `0 0 64 64` | Uses `currentColor`; useful for print, masks, disabled states, and compact controls. |
| `connection-motif.svg` | Empty states, section dividers, request progress ornament | `0 0 320 96` | Decorative relay rhythm; do not use as a progress indicator without semantic UI. |
| `approximate-zone-marker.svg` | Pre-acceptance map service area | `0 0 120 120` | Soft circular zone with no pointed tip; must not be presented as exact coordinates. |
| `privacy-location-sharing.svg` | Location permission/privacy explainer | `0 0 560 360` | Uses abstract endpoints to show separate approximate zones, independent controls, and a shielded connection. Exact-sharing copy remains semantic HTML. |
| `avatar-frame-core.svg` | Entry profile cosmetic | `0 0 256 256` | Minimal segmented frame with a generous circular photo opening. |
| `avatar-frame-orbit.svg` | Orbit profile cosmetic | `0 0 256 256` | Two connection orbits; outer layers may be rotated with reduced-motion handling in UI code. |
| `avatar-frame-signal.svg` | Signal profile cosmetic | `0 0 256 256` | Broken signal arcs; designed to remain readable at small profile sizes. |
| `avatar-frame-constellation.svg` | High-detail profile cosmetic | `0 0 256 256` | Denser node network for larger profile and customization views. |
| `avatar-frame-circuit.svg` | Circuit profile cosmetic | `0 0 256 256` | Blue/cyan circuit paths and relay nodes for a crisp technical skin. |
| `avatar-frame-solar.svg` | Solar profile cosmetic | `0 0 256 256` | Amber and burgundy signal arcs with a warm high-contrast identity. |
| `avatar-frame-mint.svg` | Mint profile cosmetic | `0 0 256 256` | Teal and lime relay geometry for a fresh technical variant. |
| `avatar-core-relay.svg` | Free relay avatar core | `0 0 128 128` | Two linked signals and a diamond handoff node; inherits the selected palette through `currentColor`. |
| `avatar-core-beacon.svg` | Free beacon avatar core | `0 0 128 128` | Four endpoints around a central non-human relay mark; inherits `currentColor`. |
| `avatar-core-orbit.svg` | Free orbit avatar core | `0 0 128 128` | Crossed orbital paths with no face or character silhouette; inherits `currentColor`. |
| `avatar-motion-drift.svg` | Free drift motion overlay | `0 0 256 256` | Transparent dotted arcs intended for slow CSS movement with a reduced-motion fallback. |
| `avatar-motion-spin.svg` | Free orbit-spin motion overlay | `0 0 256 256` | Transparent relay arcs intended for a slow colored rotation with a reduced-motion fallback. |
| `avatar-motion-pulse.svg` | Devnet pulse motion overlay | `0 0 256 256` | Transparent broken rings intended for a verified owned cosmetic and reduced-motion fallback. |
| `profile-patch-relay.svg` | Relay badge/patch cosmetic | `0 0 128 128` | Compact dark hexagonal patch. |
| `profile-patch-nearby.svg` | Nearby/community badge cosmetic | `0 0 128 128` | Uses an approximate zone rather than an exact-location pin. |

## Integration rules

- All files have transparent canvas backgrounds and contain no script, event handler, embedded raster data, font, or external reference.
- Treat cosmetics as visual profile customization only; never label them as payment for student services.
- Preserve the circular clear area in avatar frames for the profile image. Layer a frame above the avatar rather than clipping the frame artwork itself.
- Use the dark logo on near-black surfaces. The mono logo inherits its parent `color` only when embedded inline; an `<img>` keeps its SVG default rendering behavior.
- Decorative assets should use empty alt text. Meaning-bearing assets should use concise localized alt text; each SVG also carries an internal title and description.
- Suggested cosmetic tiers or prices are intentionally not encoded here; those are product/backend decisions, not verified design facts.
