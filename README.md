# Corpora desktop

Tauri v2 Rust shell for the React/TypeScript application in sibling `corpora-web`.
Bootstrapped with `bunx create-tauri-app corpora-desktop --manager bun --template react-ts --identifier org.exegia.corpora --tauri-version 2 --yes`.
The generated demo frontend was replaced with the existing web application.

## Run on macOS

1. Install Xcode Command Line Tools (`xcode-select --install`), Rust via rustup, and Bun.
2. Clone `exegia/corpora-web` and `exegia/corpora-desktop` beside each other under `~/Projects/corpora-apps/`.
3. Run `bun install` in both folders. Configure corpora-web's local dotenvx environment as for browser development.
4. In `corpora-desktop`, run `bun run dev`.

Tauri starts the sibling React Router/Vite server at http://localhost:1420 with a
strict port, then opens the native window. Changes in corpora-web use Vite HMR;
Rust changes rebuild the native backend. Stop with Ctrl-C. If port 1420 is occupied,
stop its existing server before starting this command.

## Build and IPC

`bun run build` builds corpora-web and embeds `../corpora-web/build/client` in the
native binary. No web server is needed for the installed app. Tauri hooks run
from this repository; frontendDist is relative to src-tauri/tauri.conf.json.

In the desktop webview console, verify the Rust bridge:

```js
await window.__TAURI__.core.invoke("desktop_version") // "0.1.0"
```

`withGlobalTauri` makes IPC available to the shared web app without adding a Tauri
dependency to its browser build. Guard usage with `if (window.__TAURI__)`.
Only a read-only version command is registered. No filesystem, shell or remote
origin permissions are enabled. CSP currently retains the template's null value
for compatibility with the existing web app; tighten it alongside frontend CSP work.
Auth OAuth redirects/deep links need a separate desktop integration; this setup
does not claim browser OAuth callbacks work in the native app.

## Checks and releases

Run `bun run check`, `bun test`, and `make ci` (requires native Tauri prerequisites).
See [.github/WORKFLOW.md](.github/WORKFLOW.md) for CI, semver and distribution setup.
Native packages are initially unsigned and downloaded manually from GitHub Releases.

References: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/),
[Tauri GitHub builds](https://v2.tauri.app/distribute/pipelines/github/).
