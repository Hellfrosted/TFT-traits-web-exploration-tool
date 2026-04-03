# TFT Board Exploration Tool

Electron app for exploring Teamfight Tactics board combinations with live or PBE data from [Community Dragon](https://communitydragon.org/).

## Features

- Pulls the latest TFT set data from Community Dragon live or PBE
- Filters by units, traits, roles, and emblems
- Searches boards in a worker thread with progress and cancel support
- Caches search results locally

## Run

```powershell
npm install
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

## Notes

- The selected data source can be switched between live and PBE before fetching.
- Local app data is stored under Electron's normal user-data directory, not inside the repo.

## License

[Apache 2.0](LICENSE)
