# Ruta

Commute planner for Philippine jeepneys and tricycles: which jeep to take, where to board, where to say "Para po!", and how much it costs. Expo (React Native) app that also ships as a website.

## Features (MVP)

- **Map** – OpenStreetMap via MapLibre (native) / maplibre-gl (web), OpenFreeMap tiles, no API key.
- **Routes** – jeep, modern jeep and tricycle lines for a Metro Manila corridor (`src/data/routes.ncr.json`), browsable and searchable.
- **Trip planner** – direct and one-transfer trips; boarding/alighting points are snapped onto route lines since jeeps stop anywhere (`src/lib/planner.ts`).
- **Fares** – LTFRB jeep matrix + per-LGU tricycle table with 20% student/senior/PWD discount (`src/data/fares.json`).
- **Traffic** – deterministic dummy data by time of day, affects ETAs; "Traffic at" chips simulate rush hour (`src/lib/traffic.ts`).

> Route lines are hand-traced approximations and tricycle fares are placeholders — replace with OSM route relations and LGU ordinances before release.

## Develop

Requires Node 22.13+ (`nvm use` reads `.nvmrc`).

```bash
npm install
npm run web          # browser
npx expo run:android # native; MapLibre needs a dev build, not Expo Go
npm test             # planner, fare and traffic unit tests
npm run typecheck && npm run lint
```

## Deploy (web → Vercel)

`vercel.json` builds with `expo export -p web` and serves `dist/` as a single-page app.

```bash
npx vercel        # preview
npx vercel --prod # production
```

Or import the Git repo in the Vercel dashboard — no extra settings needed. Set Node.js to 22+ in Project Settings if the build complains.

Mobile apps ship through EAS (`npx eas-cli@latest build`), not Vercel.

## Updating route data

Bump `version` in `routes.ncr.json`. To push updates without an app release, host a JSON of the same shape and set `EXPO_PUBLIC_ROUTES_URL`; the app uses it when its `version` is higher than the bundled one.
