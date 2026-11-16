# Patient Zero UI

Next.js App Router integration of the owner's supplied HTML, tokens and layouts. `/replay` uses Sigma.js/Graphology and a d3 time scale; `/gate` and `/lockfile` assess exact installation paths; `/explain/<encoded package@version>` shows source evidence; `/bench` reads the frozen measured results. Fonts are bundled IBM Plex Sans/Mono; no font CDN is required.

## Run, in order

From the repository root, use Node 22+ and npm with optional dependencies enabled (Relate's native platform binary is required):

```sh
npm ci
npm run web:dev
```

Open **http://127.0.0.1:3000**. `web:dev` builds the backend workspaces before starting Next. For a production build, stop the dev server first, then run:

```sh
npm run web:build
npm run web:start
```

Both start commands bind to **127.0.0.1**. This is a local application: API Host/Origin checks reject non-loopback and cross-origin requests; POST requires a matching Origin. Public hosting requires a separate authenticated deployment design. Do not expose this server through a public tunnel or relax these guards.

## Environment and data

**No secrets, API keys, database server or environment file is required.** Default input files, relative to the repository root:

- `patient-zero.rl`: reviewed read-only combined graph (1,574 identities).
- `bench/incidents/{chalk-debug-2025-09,shai-hulud-2025-09}.json`: incident windows/reference counts.
- `bench/results.json`: measured benchmark, including failed acceptance.
- `fixtures/lockfiles/chalk-v3.json`: historical demo metadata; never install the fixture.

Optional server-only configuration:

| Variable | Default / purpose |
| --- | --- |
| `PZ_PROJECT_ROOT` | Automatically finds the root when started by these npm scripts; set an absolute repository path for an alternate launch directory. |
| `PZ_WEB_STORE` | `patient-zero.rl`, resolved against project root; an absolute path also works. Does not accept uploads of arbitrary stores. |
| `NEXT_TELEMETRY_DISABLED` | Optional `1` to disable Next.js tool telemetry. |

Export overrides in the shell **before starting**. Backend CLI `.env` files are not auto-loaded; Next follows its normal environment loading rules for the `web` workspace. Never add credentials to client variables (`NEXT_PUBLIC_*`). None are used. Restart the web process after replacing a graph; a changed file fails closed until restart. Stop readers before rebuilding, build into a new file with the CLI's no-clobber workflow, then select the reviewed replacement. The store dialog shows its filename, hash, byte size and coverage counts.

## Assessment behavior and limits

The initial example is explicitly historical simulation, not a current evidence-time pass. Uploading a lockfile resets to evidence mode and current UTC. Mode, freeze and severity are editable; input changes clear previous results. In-app navigation preserves the current assessment in React memory; reload clears it. Only theme preference persists in localStorage.

Uploads are sent to this local server for parsing; they are not written to disk, forwarded to a registry or installed. Client limit: 1.8 MB; streamed API request limit: 2 MiB; server preflight limit: 2,000 installation locations. Larger locks use the CLI. Unsupported formats/sources, unknown versions, stale metadata and missing required evidence remain incomplete (exit 2); blocks retain exit 1 and covered policy passes exit 0. There is no pin/ignore/install operation. JSON export is explicit clipboard copy.

Replay labels historical reconstruction and masks later-observed evidence in evidence mode. Unknown publishers are not merged into an invented common publisher. The graph includes accessible version selection, zoom/reset and a WebGL-unavailable fallback. Replay finding drawer supports Escape/focus return on narrow viewports. Light/dark themes, keyboard focus and reduced-motion styles are included.

The Benchmark page deliberately shows **0/516 held-out recall**, **289/438 control flags (659.82/1,000)** and unverified first-public-advisory timing. Its data is read from the frozen experiment, not the design's illustrative values. These UI checks do not establish detector acceptance.

## Verification

```sh
npm run check
npm run web:build
npm run web:typecheck
npx playwright install chromium
# Terminal 1 (leave running):
npm run web:start
# Terminal 2, from repository root:
npm run web:test
```

The browser suite expects the production server at `127.0.0.1:3000` and one Chromium worker. Chromium installation needs network access once; tests block browser requests to external hosts. Five end-to-end cases cover replay/modes, gate/path/navigation/upload, benchmark/scoped explain, themes/dialog/drawer/mobile bounds, and API origin/host/body/location limits plus unchanged store bytes. Desktop 1440×900, tablet 1024×768 and mobile 390×844 are exercised. WebGL/browser execution requires a host that permits Chromium processes. Automated checks supplement owner visual acceptance.

Pinned UI dependencies and exact versions are in `web/package.json` and root `package-lock.json`: Next, React, Sigma, Graphology, d3-scale, local IBM Plex fonts, Zod and the existing core workspace. Playwright and type declarations are development dependencies. Keep `server-only` and the native-library externalization in `web/next.config.ts`; importing Relate into client components is unsupported.

Original HTML references are in `web/design/`; application components and route integration are in `web/components/`, `web/app/` and `web/lib/`. MCP and the GitHub Action are implemented in their own workspaces/configuration; see root README. Video/storyboard work is excluded. Publishing and submission remain owner actions.
