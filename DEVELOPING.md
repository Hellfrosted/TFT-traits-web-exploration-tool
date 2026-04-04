# Developing

This note is for maintainers working on the codebase. Keep `README.md` user-facing and short; put implementation detail here instead.

## Process Boundaries

Electron responsibilities are split across three areas:

- Main process: window bootstrap, data fetch/fallback orchestration, worker-backed search execution, cache management, and IPC registration.
- Preload: the narrow renderer bridge only. Keep it self-contained; its mirrored IPC/data-source/limit contract is checked against `bridge-contract.js` by `test/bridge-contract.test.js`.
- Renderer: query controls, results rendering, history UI, and degraded-mode handling when the bridge is unavailable.

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
- `roleDefaults.js`: default tank/carry role derivation from fetched roles

Do not hardcode stale role names or set-specific mechanics directly into HTML or renderer glue.

## Validation Commands

Use the local Windows wrapper when `tools/node/` exists:

```powershell
.\npmw.cmd run test
.\npmw.cmd run lint
.\npmw.cmd run test:smoke
.\npmw.cmd run validate:data
```

Fallback to plain `npm` if the local wrapper runtime is missing.

## Testing Notes

Current test layers cover:

- pure search/domain logic
- parser behavior and source freshness
- storage helpers
- main-process cache/search services
- renderer controller/results sorting behavior
- Electron smoke boot verification

For new work, add tests at the narrowest extracted seam first instead of expanding the legacy monolith tests.
