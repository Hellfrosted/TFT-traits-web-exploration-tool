# TFT Board Exploration Tool

Desktop app for exploring high-cap Teamfight Tactics boards from raw game data.

This project exists because `tactics.tools` Perfect Synergy was lagging my PC badly enough to cost me time during live games. The goal here is narrower: fast local board exploration for expensive late-game boards built around augments, units, traits, roles, and emblems.

Use it for questions like:

- What can I build around Stand United, Bronze For Life, or similar effects?
- What expensive boards fit these units, traits, roles, or emblems?

This is a board search tool, not a comp list or trait tracker.

## Why Use This?

- Local desktop app instead of another heavy browser tab during games.
- Focused on expensive late-game board search instead of a broader TFT toolbox.
- Supports both `latest` and `pbe` Community Dragon data.

## Q&A

### Why not just use `tactics.tools`?

`tactics.tools` is useful, but it solves a broader set of problems. This project is narrower on purpose: fast local search for expensive late-game boards built around specific conditions.

### Why Electron?

To keep the workload out of the browser while playing.

### Does this replace comp tier lists?

No. It is more useful for early-set exploration and unusual constraint searches than for looking up an established meta board.

### Where does the data come from?

TFT data comes from [Community Dragon](https://communitydragon.org/) and supports both `latest` and `pbe`.

## Setup

```sh
npm install
```

## Run

```sh
npm start
```

## Development

```sh
npm test
npm run lint
npm run validate:data
```

For maintainer workflow and smoke-test notes, see [DEVELOPING.md](DEVELOPING.md).

## License

[Apache 2.0](LICENSE)
