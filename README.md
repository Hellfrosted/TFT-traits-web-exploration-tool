# TFT Board Exploration Tool

Electron app for exploring Teamfight Tactics board combinations with live or PBE data from [Community Dragon](https://communitydragon.org/).

## Setup

```powershell
npm install
```

On Windows, local agent sessions can also use `.\npmw.cmd`, which expects a repo-local runtime under `tools/node/`.

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

## Package

```powershell
npm run pack:win
```

The packaged Windows app is written to `dist\TFT Board Exploration Tool-win32-x64\`.

To publish it, ship that folder as a zip. Do not distribute only the `.exe`.

## Notes

- The selected data source can be switched between live and PBE before fetching.
- Local app data is stored under Electron's normal user-data directory, not inside the repo.

## License

[Apache 2.0](LICENSE)
