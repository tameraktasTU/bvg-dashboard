# BVG Dashboard

Live departures, journey planning and vehicle radar for Berlin & Brandenburg. Built with Vue 3, Vite and Tailwind CSS v4.

[Live site](https://bvg.tameraktas.de) · [Transit API](https://v6.bvg.transport.rest/api.html)

## Development

Use Node.js 22.18+ or a current Node.js 24 release.

```sh
npm install
npm run dev
```

Open the local address printed by Vite. The application is now compiled with Vite; opening `index.html` directly is no longer supported.

```sh
npm run build
npm run preview
```

The production site is generated in `dist/`.

## Features

- Journey planning between stations, addresses and points of interest, with departure or arrival times and transport filters.
- Expandable connections with walking routes, transfer times, platforms and realtime delays.
- Live departures with 10, 20, 30, 45 and 60-minute windows. A single 60-minute response is filtered locally.
- Full line overviews with stopovers and the selected station highlighted.
- Nearby stops with distances when location access is permitted.
- Lazy-loaded Leaflet radar showing vehicles that serve the selected stop, with next-stop information and recentering.
- Mobile navigation dock, desktop navigation, light/dark themes and reduced-motion support.
- Existing saved stations, journey endpoints, time window, theme and current view retained through the migration.

Departures refresh every 30 seconds. Radar refreshes every 10 seconds while open. Refresh timers pause when the document is hidden; requests are cancelled when superseded or closed. Transit data and map tiles require a network connection. Location access requires HTTPS or localhost.

## Checks

```sh
npm test
npm run test:browser
```

Start the development server before the browser check. Browser QA defaults to `http://127.0.0.1:5173` and installed Microsoft Edge. Set `QA_BASE_URL` or `QA_BROWSER_CHANNEL` to use another preview or Playwright browser channel. The suite mocks transit responses for repeatable journey, departure, radar, persistence and failure checks, and captures screenshots in `.qa/`. Map tiles are requested from the real providers.

The source uses four spaces, single quotes and semicolons for JavaScript, and two spaces for CSS.

## Structure

```text
src/
├── App.vue                     # Application shell and three views
├── components/                 # Search, connection cards, line badges and dialogs
├── composables/useTransit.js   # Reactive transit state, caching and request lifecycle
├── lib/transit.js              # API helpers, route calculations and line identity
├── lib/storage.js              # Safe, compatible browser persistence
├── main.js                     # Vue entry point and bundled fonts
└── styles.css                  # Tailwind tokens, base rules and interaction motion
```

The UI uses canonical Tailwind utilities and shared theme tokens. Line colors use complete static classes so the production compiler includes every variant. Only Leaflet's generated markup needs scoped integration styles. The map and its styles are loaded on first use.

## Deployment

The included GitHub Actions workflow runs the unit tests, builds the application and deploys `dist/` after pushes to `main` or a manual workflow run on `main`. Pull requests and manual runs on other branches run the checks without deploying. The workflow and production deployment must be verified in GitHub after pushing.

In repository **Settings → Pages**, select **GitHub Actions** as the source and keep `bvg.tameraktas.de` as the custom domain. GitHub Actions deployments read the domain from these settings; a repository `CNAME` file is ignored and is not needed. Vite's default base path (`'/'`) supports this custom domain without extra configuration. If you switch to the default project URL at `https://tameraktasTU.github.io/BVG-Dashboard/`, set Vite's base to `'/BVG-Dashboard/'` before rebuilding.

For another static host, upload the complete contents of `dist/`.

## Credits

Created by [Tamer Aktas](https://tameraktas.de). Independent project, not an official BVG application.

- Transit data: [transport.rest](https://v6.bvg.transport.rest).
- UI: [Vue](https://vuejs.org), [Tailwind CSS](https://tailwindcss.com), and locally bundled [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans).
- Icons: [Tabler Icons](https://tabler.io/icons), licensed under MIT.
- Maps: [Leaflet](https://leafletjs.com), [OpenStreetMap](https://www.openstreetmap.org/copyright) and Esri Dark Gray Canvas. Attribution remains on the map.
- BVG brand mark: [theSVG catalog](https://thesvg.org/icon/bvg). The logo identifies the transit network; all brand rights remain with their owner.
