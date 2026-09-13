# MapLibre runtime assets

These browser worker files are copied from `maplibre-gl` 6.9.0:

- `dist/maplibre-gl-worker.mjs`
- `dist/maplibre-gl-shared.mjs`

They are served from the same origin so Next.js Turbopack does not rewrite
MapLibre's package-relative worker URL to the application HTML document. The
worker and shared module must always be updated together with the pinned
`maplibre-gl` package version.

MapLibre's license is preserved in `LICENSE.txt`.
