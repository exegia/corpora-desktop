# Release flow

`feat/*` (or another conventional type) → `dev` → `next` → `release/vX.Y.Z` → `main`.
Draft PRs run guard only. Ready PRs run checks, optional AI review, and native builds
for Apple Silicon, Intel macOS, Linux x64 and Windows x64. `package` aggregates the matrix.
`next` builds downloadable preview artifacts before cutting the release branch.
Merged release PRs build installers and publish a versioned GitHub Release.
Daily promotion retains corpora-web's churn-based semver heuristic and manual override.
`make version-set VERSION=X.Y.Z` synchronizes package.json, Cargo.toml and Cargo.lock;
Tauri reads its version directly from package.json.

Configure AUTOMATION_APP_ID and AUTOMATION_APP_PRIVATE_KEY with the automation App
installed on this repository. These are required for promotion, release PR creation
and post-release branch synchronization. CLAUDE_CODE_OAUTH_TOKEN is optional.
Enable auto-merge and apply `.github/rulesets` using `make rulesets-apply` if the
GitHub plan supports private repository rulesets.

Set repository variables VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and
VITE_CORPORA_API_URL to public client configuration. Never use service-role keys.
CI checks out the immutable corpora-web revision in web-source.json.
Update that SHA deliberately when adopting frontend changes.

Initial installers are unsigned. macOS notarization and Windows signing require
platform certificates and a signing integration before public distribution.
There is no in-app updater yet; releases are manually downloaded from GitHub.
