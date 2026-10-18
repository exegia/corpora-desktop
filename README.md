# Corpora Desktop

Corpora Desktop is a Tauri application that mounts Corpora Web as an interactive
`<CorporaWeb />` React component. Production builds include a local frontend;
they do not open the hosted Corpora Web site. Corpus data and authentication
still use the configured remote APIs, so bundling the UI does not make those
features available offline.

## Setup and first launch

Install Bun and, for native development, stable Rust/Cargo and your operating
system's Tauri build prerequisites. The repository selects stable Rust through
`rust-toolchain.toml`. CI also uses Node 24; existing Makefile/release-guard
commands require Node, although the frontend scripts run through Bun.

The default source layout is two sibling checkouts:

```text
corpora-apps/
  corpora-desktop/
  corpora-web/       # Web source and its own installed node_modules
```

From this Desktop checkout, clone Web if it is missing:

```sh
git clone https://github.com/exegia/corpora-web.git ../corpora-web
```

For the existing checkout on this machine, install dependencies and launch:

```sh
cd '/Volumes/External HD/Dev/corpora-apps/corpora-web'
bun install --frozen-lockfile
cd ../corpora-desktop
bun install --frozen-lockfile
bun run dev
```

Configure Web's public environment settings before launch, as described below.
Both repositories need their dependencies installed: Desktop compiles Web source
and resolves some of its imports from Web's own `node_modules`.

For an alternate source location or a relocated Desktop worktree, set the Web
checkout path before running any dev, build or check command:

```sh
export CORPORA_WEB_DIR='/absolute/path/to/corpora-web'
bun run dev
```

The original sibling layout needs no override. `CORPORA_WEB_DIR` selects a local
checkout; it does not clone, install or switch that checkout's revision.

## Development, checks and builds

Run these commands from `corpora-desktop`:

| Command | Result |
| --- | --- |
| `bun run dev` | Starts the Desktop Vite frontend and opens the native Tauri window. |
| `bun run web:dev` | Starts only Desktop's frontend at `http://127.0.0.1:1420`; useful for browser development without Rust. |
| `bun run check` | Checks version/build contracts, regenerates Web's ignored React Router types, and typechecks the active entry and Vite configuration. |
| `bun run web:build` | Compiles Desktop's frontend into `dist/`, including Web routes, styles, fonts and public assets. |
| `bun run build` | Runs Tauri's release/package build for the current platform; its hook first runs `web:build`. |

The two dev commands use the same fixed port; run one at a time. Tauri's dev URL
uses `127.0.0.1` explicitly so an older Web server on IPv6 `localhost` cannot be
mistaken for Desktop's frontend.

Run the focused adapter tests or build a native debug binary without installers:

```sh
bun test ./src/lib/web-route.test.tsx
bun run tauri build --debug --no-bundle -- --locked
```

Tauri reads `dist/` through `frontendDist: "../dist"` when building the app.
The sibling Web checkout, its dependencies, Bun and Rust are build-time inputs.
After packaging, Tauri embeds the frontend JS, CSS, fonts and public assets in
the executable; the installed app does not resolve source aliases, read the
sibling checkout or `dist/`, or require a Vite server. Remote API access remains
separate from those bundled assets.

### Local macOS release packaging

From the same sibling checkout layout, run:

```sh
bun run build
```

With the current version and an Apple Silicon host, the default output paths are:

- `src-tauri/target/release/bundle/macos/Corpora.app`
- `src-tauri/target/release/bundle/dmg/Corpora_0.1.0_aarch64.dmg`

The checked-in `bundle.macOS.signingIdentity` is `"-"`, so this produces an
**ad-hoc-signed local artifact**, not an Apple Developer ID signed/notarized
public release. `APPLE_SIGNING_IDENTITY` can override that setting. For local
verification, omit Apple certificate/notarization credentials and, if needed,
explicitly set `APPLE_SIGNING_IDENTITY=-`. See
[Tauri's macOS signing guide](https://v2.tauri.app/distribute/sign/macos/) before
public distribution; ad-hoc signing does not establish a trusted developer
identity or remove Gatekeeper restrictions for downloaded apps.

`bundle.createUpdaterArtifacts` is disabled because an updater has not been
initialized and its configuration still contains placeholders. The normal app
and DMG build therefore does not require a Tauri updater private key. Enabling
automatic updates later requires a real updater configuration and signed update
artifacts; no update archive is part of this verified local distribution.

## Environment configuration

Use the public settings expected by Web: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_CORPORA_API_URL`. Consult Web's
`.env.example` for its full configuration contract.

Vite's environment directory is the selected Web checkout. Outside CI,
`scripts/web.ts` decrypts that checkout's `.env` with its `.env.keys` through
Web's installed dotenvx package, when `.env` exists. Explicit process environment
variables take precedence. CI supplies public `VITE_*` values directly and skips
the dotenvx step. Do not commit decryption keys or secret values; `VITE_*` values
are embedded in the public frontend bundle and must contain only client settings.

The native shell loads the local UI bundle and permits connections to the
configured APIs through its CSP. Development uses the local Vite server; a
production app does not need that server or a running hosted Web frontend.
Changing API settings for a production app requires rebuilding its frontend.

## How Web is embedded

`src/main.tsx` owns Desktop's React root and mounts
`src/components/corpora-web.tsx`. The component creates a React Router data router
and mounts Web's Exegia and toast providers. It reuses Web's root route component,
not its HTML `Layout`, which contains document tags and framework-only helpers.

`vite.config.ts` reads Web's existing `app/routes.ts` at build time and generates
lazy route imports. `src/lib/web-route.tsx` maps `clientLoader` and `clientAction`
to data-router loaders/actions and supplies the route props Web expects,
including loader/action data, params, matches and route errors. Vite also maps
Web's aliases, shares React/context dependencies, scans its Tailwind classes and
includes its CSS, fonts and `public/` assets.

Desktop owns the Tauri window, native commands, tray/autostart behavior,
frontend-ready notification, local build and native configuration. Web continues
to own the application screens, route table and API-facing behavior. The adapter
does not require changes to Web's source.

| Strategy | Status and tradeoff |
| --- | --- |
| Sibling source + Desktop adapter | **Implemented.** Reuses the checkouts already in use and keeps Desktop's frontend small. Local builds use the selected checkout's current files, including uncommitted edits, so Desktop's lockfile alone cannot reproduce them. |
| Git submodule | An alternative, not implemented. Would record a Web commit in Desktop and change clone/update steps. Web would still need dependencies installed, and the routing/provider/style adapter would still be necessary. |
| Git dependency or npm package | An alternative, not implemented. Would need a consumable application export and an explicit dependency, routing, provider, style and asset contract. A Git dependency can pin a commit; npm can pin a published version. Pointing at the existing repository does not create that embedding API. |

The sibling adapter is the simplest fit for the current setup because Web is
already a separate installed checkout and has no exported embedded-app entry.
For CI, `web-source.json` records the Web repository and commit;
`.github/actions/web` checks out that revision beside Desktop and installs its
locked dependencies. Local commands do not enforce that pin. To reproduce a CI
build locally, use the same Web commit with no uncommitted source changes and
the same public build configuration. A submodule or package would improve how
the dependency is acquired and pinned; neither automatically resolves the React
integration or native authentication callbacks.

## Verified coverage and remaining limits

The original checkout passed dependency installation with `--frozen-lockfile`,
`bun run check`, both focused adapter tests, `bun run web:build` and
`git diff --check`. Browser checks covered the anonymous login/signup navigation
and theme interaction during integration work. Native verification now includes
both the earlier macOS debug compile and a successful normal release/package
build on Apple Silicon, producing the app and DMG listed above.

The release check verified the ad-hoc code signature, DMG integrity, all 76
embedded frontend asset names and the contents of its 75 non-HTML assets (Tauri
rewrites HTML to inject its runtime/CSP). A copy taken from the DMG stayed running
for a 12-second process smoke test outside the repository, with reads of both
source checkouts and outbound networking denied. Its environment pointed to a
nonexistent Web checkout and excluded Bun/Node from `PATH`. The copied process
loaded the expected executable and had no source files or TCP connections open.
This verifies packaging/source independence, not a visual native UI acceptance
test. Artifact hashes and the local packaging evidence are recorded in
`src-tauri/target/release/bundle/local-release-verification.json`.

This verification covers macOS arm64 only. The artifacts are ad-hoc signed and
not notarized; Developer ID signing, notarization and public-installation
acceptance remain separate release work. Windows, Linux and Intel macOS
packaging were not tested in this check.

Native OAuth/email callback deep links are not configured; those controls retain
Web's browser redirect behavior. Authentication work is on hold, and the release
verification did not initiate sign-in or test authenticated data flows.
The adapter targets Web's current client-only SPA: server loaders or additional
framework-only exports would require revisiting it. The production build also
reports a large shared UI chunk.

The active-entry typecheck follows `src/main.tsx` and its imported Web source;
it does not certify every file in `src/` or every Web route's types. Preserved,
inactive template drafts still reference missing stores/translations and are
outside the running app and that typecheck. The focused adapter tests are not
the entire repository suite; an existing release-guard test was blocked locally
by the missing Node executable.
