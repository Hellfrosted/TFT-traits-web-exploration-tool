# Agent Notes

## Local Node Wrapper

- `npmw.cmd` is checked into the repo as a local Windows helper.
- If `tools/node/` exists, prefer the repo-local wrapper from agent sessions:

```powershell
.\npmw.cmd install
.\npmw.cmd run test
.\npmw.cmd run lint
.\npmw.cmd start
```

- `npmw.cmd` depends on `tools/node/`, but `tools/node/` is intentionally gitignored.
- On a fresh clone where `tools/node/` is missing, fall back to the system `npm` / `node` commands from `README.md` instead of blocking on the wrapper.

## Documentation Preferences

- Keep `README.md` short and simple.
- Prefer practical setup and run instructions over long architecture writeups.
- Keep public `README.md` commands platform-neutral by default. Prefer plain `npm` commands there; mention `npmw.cmd` only as a local Windows helper when needed.
- Keep repo-maintainer and agent-only context in `AGENTS.md`, not `README.md`.
- Use `README.md` for user-facing purpose, motivation, and short Q&A. Keep packaging and release-process detail out unless explicitly requested.
- Do not turn `README.md` into AI-style marketing copy.
- No emojis, badges, or bloated sections in project docs unless explicitly requested.
- Default to plain, direct wording over polished fluff.

## Project Preferences

- This is an unreleased greenfield project. Do not keep legacy migration paths or backward-compat code unless explicitly requested.
- Prefer solutions that stay flexible across TFT set updates so routine set-to-set maintenance stays low.
- Keep set-specific quirks data-driven. Prefer `setOverrides.js`, `roleDefaults.js`, and existing engine abstractions over hidden one-off exceptions.

## Product Intent

- The project exists because `tactics.tools` Perfect Synergy lagged the user's PC badly enough to cost in-game time during live play.
- The project should stay focused on exploring expensive, high-cap, late-game boards built around augments like Stand United, Bronze For Life, and similar "build around this condition" spots.
- Do not drift the product toward narrow helper features the user does not want, such as one-off set gimmicks, trait trackers, or niche utility views modeled after existing sites.
- When describing the product in `README.md`, emphasize fast local board exploration, augment-driven late-game search, and reduced browser overhead.
- If `README.md` compares against `tactics.tools`, keep the comparison factual and grounded in product focus and responsiveness, not hype.
- The user wants the public README to explain why the project exists and why someone would use it over `tactics.tools`, including a short Q&A section covering common objections.

## Runtime / Electron

- If the app opens with `Status: Unloaded`, suspect renderer startup timing or a broken preload bridge before suspecting the data parser.
- Keep top-level renderer work bootstrap-safe. Do not assume the full DOM is ready during script evaluation.
- If the UI shows `Electron preload bridge is unavailable`, `window.electronAPI` was not exposed. Check `preload.js` first.
- Keep `preload.js` self-contained where possible. A preload failure removes the whole renderer bridge.
- Preserve the main-process logging hooks for renderer console output and preload failures.

## Data / CDragon

- The app supports both `pbe` and `latest` Community Dragon channels. Source selection is part of the product, not a temporary debug path.
- Parsed units must stay scoped to the detected set roster. Do not rebuild the board pool from every raw champion-like record.
- Source-specific fallback snapshots are stored separately. Do not collapse live and PBE fallback files back into one shared cache.
- Raw source snapshots are cached by source. Current policy: `pbe` stays fresh until the next `11:00 AM` Pacific rollover; `latest` refreshes after 13 days.
- The engine already supports weighted trait contributions, variants, conditional effects, and conditional profiles. Extend those abstractions before adding one-off mechanic branches.
- Default role filters are derived from fetched roles via `roleDefaults.js`. Do not reintroduce hardcoded role hashes or stale role names in HTML.
- `tools/validate-data-sources.js` is the smoke test for live/PBE parsing health. Run `.\npmw.cmd run validate:data` when the local wrapper is available, otherwise use `npm run validate:data`.

## Search / UI

- `renderer.js` is now responsible for variant lock controls as part of the query model. Keep query serialization and history replay aligned with `searchParams.js`.
- `components/multiSelect.js` intentionally exports `window.setupMultiSelect`; do not treat that global exposure as dead code.
- Cache/history UI should tolerate missing bridge access and escaped user-visible strings. Keep error handling defensive in renderer-facing components.

## Packaging / Distribution

- The repo currently uses `@electron/packager`, not `electron-builder`.
- Current packaging command: `npm run pack:win`.
- `electron-packager` was chosen because the user prefers a straightforward packaged app folder over a self-extracting portable executable with per-launch overhead.
- Public docs should not overemphasize packaging details. If release notes are needed, note that users must ship the packaged folder as a zip, not only the `.exe`.

## Git / Release

- The GitHub repository moved to `Hellfrosted/TFT-traits-web-exploration-tool`. The old remote URL still redirects, but prefer the new repository name in release or GitHub tooling.
- Version `0.0.1` is the first tagged release. Keep package version and release tag aligned.
- `AGENTS.md` is committed on purpose so future agent sessions inherit the repo context on a fresh clone.
- `npmw.cmd` is also committed on purpose, but `tools/node/` remains ignored so a fresh clone may still need system `npm` until a local runtime is restored.
