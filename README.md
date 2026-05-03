# TFT Board Exploration Tool

Desktop app for exploring high-cap Teamfight Tactics boards from raw Community Dragon data.

This project exists because `tactics.tools` Perfect Synergy was slow enough on my PC to get in the way during live games. It stays narrower on purpose: fast local search for expensive late-game boards built around augments, units, traits, roles, and emblems.

Use it to answer questions like:

- What can I build around Stand United or Bronze For Life?
- What expensive boards fit these units, traits, roles, or emblems?

This is a board search tool, not a comp list or trait tracker.

## Why Use It

- Local desktop app instead of another heavy browser tab.
- Focused on late-game board exploration instead of a broader TFT toolbox.
- Supports both `latest` and `pbe` Community Dragon data.

## Q&A

### Why not just use `tactics.tools`?

`tactics.tools` is useful, but this project is narrower on purpose and optimized for fast local board exploration.

### Does this replace comp tier lists?

No. It is for exploration and constraint-based searches, not meta snapshots.

## Setup

```sh
pnpm install
```

## Run

```sh
pnpm start
```

`pnpm start` builds the TypeScript main process plus the Vite/React renderer and opens the Electron app.

## Development

```sh
pnpm dev:renderer
pnpm dev:electron
pnpm typecheck
pnpm test
pnpm lint
pnpm validate:data
```

Run the two dev commands in separate terminals when you want Vite hot reload inside Electron.


## License

[Apache 2.0](LICENSE)
