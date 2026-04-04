# TFT Board Exploration Tool

Desktop app for exploring Teamfight Tactics late-game boards from raw game data.

This project exists because I was using `tactics.tools` Perfect Synergy during games and it lag my PC for long enough it cost a whole round. I wanted a local tool that stays focused on one job: exploring expensive, strong endgame boards built around go wide augment given X board constraints.

This tool is built around questions like:

- what can I build around Stand United, Bronze For Life, or similar effects?
- what expensive boards fit these units, traits, roles, or emblems?

It is a board search tool, not a comp list or trait tracker solver.

## Why This Over `tactics.tools`?

- This tool is focused on board exploration, especially high-cap late-game boards, instead of a broader collection of TFT utilities.
- It runs as a local desktop app, so it does not clog up your browser session where you are also watching streams, videos, or guides.

## Q&A

### Why not just use `tactics.tools`?

`tactics.tools` is useful, but it solves a broader set of problems than I want here. This project is narrower on purpose: fast local search for expensive late-game boards built around augment conditions.

### Why Electron?

Because I do not want another heavy browser tab competing with videos, stream while I am in game. A desktop app keeps this tool separate from the browser workload and I just want to learn how to use electron :)

### Is this trying to replace comp tier lists?

No. The point is exploration for day 1 of new set, not replacing TFTacademy. If the meta is already exist, a tier list is faster. This tool is more for when you want to search for strong endgame boards that fit a condition on day 0.
### Where do you got the game data?

TFT data from [Community Dragon](https://communitydragon.org/), supports both `latest` and `pbe`.

## Setup

```powershell
npm install
```

## Run

```powershell
npm start
```

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
