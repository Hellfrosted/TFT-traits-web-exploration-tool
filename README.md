# TFT Board Exploration Tool

Desktop app for exploring Teamfight Tactics late-game boards from raw game data.

This project exists because I was using `tactics.tools` Perfect Synergy during games and it could lag my PC for long enough to cost real time in a live round. I wanted a local tool that stays focused on one job: exploring expensive, strong endgame boards built around augment and board constraints.

Instead of centering the experience around narrow helper features, this tool is built around questions like:

- what are the strongest capped boards for this augment?
- what can I build around Stand United, Bronze For Life, or similar effects?
- what expensive boards fit these units, traits, roles, or emblems?
- what does that search look like on live or PBE data?

It is a board search tool first, not a comp list or trait tracker.

## Why This Over `tactics.tools`?

- This tool is focused on board exploration, especially high-cap late-game boards, instead of a broader collection of TFT utilities.
- It runs as a local desktop app, so it does not compete with the rest of your browser session when you are also watching streams, videos, or guides.
- It is designed for direct constraint-based search: units, traits, roles, emblems, and source selection.

## Q&A

### Why not just use `tactics.tools`?

`tactics.tools` is useful, but it solves a broader set of problems than I want here. This project is narrower on purpose: fast local search for expensive late-game boards built around augment-style conditions.

### Why Electron?

Because I do not want another heavy browser tab competing with videos, streams, and the rest of the session while I am in game. A desktop app keeps this tool separate from the browser workload.

### Is this trying to replace comp tier lists?

No. The point is exploration, not replacing every TFT reference site. If you already know the board you want, a tier list is faster. If you want to search for strong boards that fit a condition, this tool is the point.

### Does it use live game data?

Yes. It pulls TFT data from [Community Dragon](https://communitydragon.org/) and supports both `latest` and `pbe`.

## Setup

```powershell
npm install
```

## Run

```powershell
npm start
```

On Windows, local agent sessions can also use `.\npmw.cmd` if a repo-local runtime is present under `tools/node/`.

## Development

```powershell
npm test
npm run test:smoke
npm run test:all
npm run lint
npm run validate:data
```

## License

[Apache 2.0](LICENSE)
