# Developing

This note is for maintainers working on the codebase. Keep `README.md` user-facing and short; put implementation detail here instead.

## Process Boundaries

Electron responsibilities are split across three areas:

- Main process: window bootstrap, data fetch/fallback orchestration, worker-backed search execution, cache management, and IPC registration.
- Preload: the narrow renderer bridge only. Keep it self-contained; its mirrored IPC/data-source/limit contract is checked against `bridge-contract.js` by `test/bridge-contract.test.js`.
- TypeScript app source: main process, preload, worker, tests, tools, parser, engine, and React renderer.
- Renderer: Vite/React UI under `src/renderer/`.

The Electron app loads compiled Node output from `build/` and renderer output from `build/renderer-dist/index.html` in normal mode. Use `npm run build` before launching Electron directly. For hot reload, run `npm run dev:renderer` in one terminal and `npm run dev:electron` in another.

## Search Pipeline

The search flow is intentionally staged:

1. Normalize query params in `searchParams.js`.
2. Build or reuse a prepared search context from the cache service.
3. Estimate combinations before starting a worker-backed search.
4. Guard large searches by remaining slots and combination limits.
5. Run DFS/variant evaluation in the worker and cache successful results by data fingerprint plus normalized query.

Internal search logic is split under `engine/`:

- `trait-methods.js`: trait contribution and variant/conditional trait helpers
- `condition-methods.js`: compiled condition handling
- `search-context.js`: filtering, slot math, and estimation helpers
- `search.js`: board evaluation and DFS orchestration

Keep new behavior out of `engine.js`; use it as the stable facade.

## Parser Pipeline

Parsing is staged around set-scoped raw/CDragon inputs:

1. Detect the active set from CDragon or raw assets.
2. Build hash dictionaries, raw trait metadata, and champion references.
3. Filter the raw unit pool to the detected set.
4. Apply data-driven overrides from `setOverrides.js`.
5. Resolve roles, trait contributions, variants, conditional effects/profiles, and icon assets.
6. Produce a stable parsed-data fingerprint for cache invalidation.

Parser responsibilities are split under `data-engine/`:

- `parse-set-detection.js`
- `parse-role-resolution.js`
- `parse-fingerprint.js`
- `parse-data.js`

When adding new TFT mechanics, prefer extending existing variant/conditional abstractions before adding one-off branches.

## Set-Specific Changes

Put set-specific behavior in data-driven files first:

- `setOverrides.js`: excluded traits/units, role overrides, unit overrides, conditional profiles/effects, selection groups
- `src/renderer/helpers.ts`: default tank/carry role derivation from fetched roles

Do not hardcode stale role names or set-specific mechanics directly into HTML or renderer glue.

## Validation Commands

Use the local Windows wrapper when `tools/node/` exists:

```powershell
npm run build
npm run typecheck
.\npmw.cmd run test
.\npmw.cmd run lint
.\npmw.cmd run test:smoke
.\npmw.cmd run test:smoke:unit
.\npmw.cmd run validate:data
.\npmw.cmd run pack:win
.\npmw.cmd run pack:smoke
```

Fallback to plain `npm` if the local wrapper runtime is missing.

`npm run test:smoke` builds TypeScript and the Vite renderer, then boots the actual Electron app through `--smoke-test`.

`npm run test:smoke:unit` keeps the window-service contract test available when you only want the stubbed unit-level smoke assertions.

`npm run validate:data` is intentionally live and network-dependent. Use it as a manual parser health check, not as a local offline gate.

## Testing Notes

Current test layers cover:

- pure search/domain logic
- parser behavior and source freshness
- storage helpers
- main-process cache/search services
- renderer boot behavior through the Electron smoke test
- Electron smoke boot verification

For new work, add tests at the narrowest extracted seam first instead of expanding the legacy monolith tests.

## Packaging

Windows packaging stays on `@electron/packager`.

Use:

```powershell
npm run pack:win
npm run pack:smoke
```

`npm run pack:win` produces a packaged app folder under `dist/`.

`npm run pack:smoke` boots the newest packaged Windows build with `--smoke-test` and exits non-zero if preload or renderer boot is broken.

Ship the packaged folder as a zip. Do not distribute only the `.exe`.

## Recovery And Cache

The app stores search artifacts under Electron `userData` in `search-data/`.

Current on-disk artifacts:

- `search_cache/*.json`: cached board-search results
- `data_fallback_pbe.json`
- `data_fallback_latest.json`
- `cache-migration-state.json`

The UI `Manage Cache` modal is the primary recovery path.

- `Delete` removes one cached search entry.
- `Clear All` removes cached search results and fallback snapshots for every source.
- If a clear operation is only partially successful, the modal now reports the files that could not be removed.

Malformed fallback snapshots are quarantined automatically on read instead of being retried forever in place.

## Data Freshness

Raw source snapshots are cached by source.

- `latest` stays fresh for 13 days from fetch time.
- `pbe` stays fresh until the next `11:00 AM` Pacific rollover.

If Community Dragon is unreachable, the app now only reuses a fallback snapshot when that snapshot is still fresh under the same source policy.

When the UI says `Using cached snapshot`, it means the app served a still-fresh offline snapshot instead of a live network fetch.

## Diagnostics

Primary failure signals are still console-driven.

- Main-process startup, preload, and renderer console messages are forwarded through [main-process/window-service.js](main-process/window-service.js).
- Fatal uncaught main-process errors are surfaced to the renderer and then the app exits to avoid continuing in a corrupted state.
- Parser/data fetch failures surface in the status line and, where appropriate, dialog UI.

Useful checks:

```powershell
npm test
npm run test:smoke
npm run pack:win
npm run pack:smoke
npm run validate:data
```

If the app opens with `Status: Unloaded`, check preload/renderer boot first before assuming the parser is broken.
