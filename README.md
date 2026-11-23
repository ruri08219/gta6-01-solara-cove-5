# gta6-01-solara-cove-5

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ruri08219/gta6-01-solara-cove-5/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ruri08219/gta6-01-solara-cove-5/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLARA COVE — a sun-soaked open-world crime game built from scratch for make.fun's "Make GTA 6" bounty. Explore a low-poly bay city on foot and by car: steal cars, outrun the Cove City Police, climb the wanted ladder, run 8 story jobs for your crew, and build respect across four districts — Marina, Old Town, Harbor and Hillside. Everything is original: our own city, characters, vehicles, story and art. No Rockstar / GTA names or assets.

## How to play

- **WASD** — move on foot / drive
- **Mouse** — look around (click the game first to lock the pointer)
- **E** — enter / exit a car, interact
- **Space** — handbrake / jump
- **Shift** — sprint
- **R** — radio station next
- **Esc** — pause

## Run it

```sh
npx serve game
```

Then open http://localhost:3000 in desktop Chrome. No build step, no network request while playing — every script, library and asset is a file under `game/`.

## What is inside

- `game/index.html` — the page: start screen, HUD, minimap, dialogue
- `game/src/config.js` — city constants, colours, sizes
- `game/src/city.js` — the bay city: street grid, low-poly blocks, harbour, beach, districts
- `game/src/world.js` — sky, sea, street lights, trees, world state
- `game/src/vehicles.js` — cars: spawn, low-poly models, arcade driving
- `game/src/input.js` — keyboard + mouse
- `game/src/render.js` — three.js scene, third-person camera
- `game/src/main.js` — game loop, START → PLAY state machine
- `game/src/police.js` — Cove City Police, wanted level, dispatch, helicopter, roadblocks
- `game/src/jobs.js` — 8 story jobs, story, combat
- `game/src/hud.js` — HUD, minimap, crew abilities, radio, save, audio
- `game/vendor/three.min.js` — three.js r160, vendored
- `main.ts` — hands the game in: copies `game/` + `screenshots/` to the output dir and writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?ref=ruri08&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
