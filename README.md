# Ruta

Commute planner for Philippine jeepneys and tricycles: which jeep to take, where to board, where to say "Para po!", and how much it costs. Expo (React Native) app that also ships as a website.

## Features (MVP)

- **Map** – OpenStreetMap via MapLibre (native) / maplibre-gl (web), OpenFreeMap tiles, no API key.
- **Routes** – jeep, modern jeep and tricycle lines for a Metro Manila corridor (`src/data/routes.ncr.json`), browsable and searchable.
- **Trip planner** – direct and one-transfer trips; boarding/alighting points are snapped onto route lines since jeeps stop anywhere (`src/lib/planner.ts`).
- **Fares** – LTFRB jeep matrix + per-LGU tricycle table with 20% student/senior/PWD discount (`src/data/fares.json`).
- **Traffic** – deterministic dummy data by time of day, affects ETAs; "Traffic at" chips simulate rush hour (`src/lib/traffic.ts`).
- **Community routes** – commuters draw and submit routes (Routes → "+ Add route"). They show as *unverified* until 3 other devices confirm them ("Nasakyan ko 'to ✓"), and the planner ranks them slightly below official routes. Stored by the API in `server/`.

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

## Community routes API (`server/` → Fly.io)

Node 24 + Hono + Turso (libSQL). No accounts: each install sends an anonymous `X-Device-Id` used for attribution, rate limits (10 submissions/hour) and one confirmation per device. This is spam friction, not authentication.

| Method | Path | |
| --- | --- | --- |
| GET | `/routes` | All community routes as GeoJSON features (`status`: `unverified`/`verified`) |
| POST | `/routes` | Submit a route (validated: inside PH, ≥2 points, ≤5 km between points) |
| POST | `/routes/:id/confirm` | Confirm a route (not your own; idempotent) |

```bash
cd server && npm install
npm run dev        # http://localhost:8080, in-memory store unless TURSO_DATABASE_URL is set
npm test           # API tests (in-memory + in-memory SQLite via libSQL)
```

For a persistent local database: `TURSO_DATABASE_URL=file:local.db npm run dev`.

Point the app at it with `EXPO_PUBLIC_API_URL=http://localhost:8080 npm run web`. Without that variable the app runs on bundled routes only and hides "Add route".

### Deploy to Fly.io

```bash
cd server
turso db create ruta --location aws-ap-northeast-1   # Tokyo; fly.toml uses nrt to match
fly launch --no-deploy --copy-config              # app name is in fly.toml
fly secrets set TURSO_DATABASE_URL="$(turso db show ruta --url)" \
  TURSO_AUTH_TOKEN="$(turso db tokens create ruta)" \
  CORS_ORIGIN=https://<your-app>.vercel.app
fly deploy
```

Tables are created on boot. Then set `EXPO_PUBLIC_API_URL=https://<app>.fly.dev` in Vercel (Project → Settings → Environment Variables) and redeploy the web app.

## Updating route data

Bump `version` in `routes.ncr.json`. To push updates without an app release, host a JSON of the same shape and set `EXPO_PUBLIC_ROUTES_URL`; the app uses it when its `version` is higher than the bundled one.
