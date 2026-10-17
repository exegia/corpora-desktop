# corpora-desktop — native builds and release promotion.
# Usage: make <target>   (run from the repo root)
#
# CI calls these targets directly; every workflow step is a one-line `make`.

BUN := bun

# `--frozen-lockfile` in CI, a plain install locally.
INSTALL_FLAGS ?=

# Ref whose commits `next-version` analyzes (semantic-release rules, release.config.mjs).
REF ?= HEAD

# Commit range for `release-notes`.
RANGE ?= origin/main..HEAD

# owner/name. The workflows set this from ${{ github.repository }}; otherwise it
# is derived from the origin remote. `gh` reads this variable natively too.
# (sed uses `,` as its delimiter: a `#` would open a comment, even inside $(shell).)
GH_REPO ?= $(shell git config --get remote.origin.url 2>/dev/null | sed -E 's,.*github\.com[:/],,; s,\.git$$,,')

# Branch and commit-title types accepted by `pr-guard`.
TYPES := feat|fix|chore|docs|ci|refactor|test|perf|build|style|revert|ai|copilot

# Native output directory.
BUILD_DIR := src-tauri/target

pkg_version = node -p 'require("./package.json").version'

.DEFAULT_GOAL := help

.PHONY: help install serve build preview test typecheck lint check ci pack \
        clean distclean pkg-version next-version version-set release-notes \
        pr-guard release-pr release-branch delete-branch deploy deploy-preview \
        release release-check rulesets-apply rulesets-diff \
        bootstrap-lanes promote-pr cut-release \
        sync-lanes cleanup-cycle cleanup-local

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# --- development ---
install:
	bun install $(INSTALL_FLAGS)
dev:
	bun run dev
build:
	bun run build
check:
	bun run check
	cargo fmt --manifest-path src-tauri/Cargo.toml --check
	cargo check --locked --manifest-path src-tauri/Cargo.toml
test:
	bun test
ci: install check test
pack: install build

# --- versions ---------------------------------------------------------------

pkg-version: ## Print the version in package.json
	@$(pkg_version)

next-version: ## Print the version semantic-release would cut from REF (empty: nothing to release)
	@$(BUN) scripts/next-version.ts "$(REF)"

version-set: ## Write VERSION into package.json (env: VERSION)
	@set -eu; : "$${VERSION:?VERSION is required}"; \
	bun scripts/version.ts "$$VERSION"; \
	echo "package.json is now $$VERSION"

release-notes: ## Print a markdown changelog for RANGE (default origin/main..HEAD)
	@git log --no-merges --reverse --pretty='- %s' $(RANGE) | grep . \
	  || echo '- _Nothing merged yet._'

# --- pull requests ----------------------------------------------------------

pr-guard: ## Validate a PR's base, branch name and title (env: BASE, HEAD, TITLE)
	@set -eu; \
	: "$${BASE:?BASE is required}" "$${HEAD:?HEAD is required}"; \
	case "$$BASE" in \
	main) \
	  echo "$$HEAD" | grep -Eq '^release/v[0-9]+\.[0-9]+\.[0-9]+$$' \
	    || { echo "::error::main only accepts PRs from release/vX.Y.Z (got '$$HEAD')"; exit 1; }; \
	  want="release/v$$($(pkg_version))"; \
	  [ "$$want" = "$$HEAD" ] \
	    || { echo "::error::package.json declares $$want but the branch is $$HEAD"; exit 1; }; \
	  ;; \
	dev|release/v*) \
	  echo "$$HEAD" | grep -Eq '^($(TYPES))/[a-z0-9][a-z0-9._-]*$$' \
	    || { echo "::error::branch must be <type>/<slug> — one of $(TYPES) (got '$$HEAD')"; exit 1; }; \
	  printf '%s' "$${TITLE-}" | grep -Eq '^($(TYPES))(\([a-z0-9._/-]+\))?!?: .+' \
	    || { echo "::error::PR title must read '<type>: summary' (got '$${TITLE-}')"; exit 1; }; \
	  ;; \
	next) \
	  [ "$$HEAD" = "dev" ] || echo "$$HEAD" | grep -Eq '^chore/sync-main-into-next$$' \
	    || { echo "::error::next only accepts PRs from dev (got '$$HEAD')"; exit 1; }; \
	  ;; \
	*) \
	  echo "::error::$$BASE is not a valid base — target dev, next, main, or release/vX.Y.Z"; exit 1;; \
	esac; \
	echo "guard passed: $$HEAD -> $$BASE"

release-pr: ## Open or refresh the draft release PR into main (env: BRANCH)
	@set -eu; \
	branch="$${BRANCH:-$$(git rev-parse --abbrev-ref HEAD)}"; \
	version="$${branch#release/v}"; \
	git fetch --quiet origin \
	  "main:refs/remotes/origin/main" "$$branch:refs/remotes/origin/$$branch"; \
	body="$$(mktemp)"; \
	{ printf 'Release **v%s**.\n\n## Changes\n\n' "$$version"; \
	  $(MAKE) -s --no-print-directory release-notes RANGE="origin/main..origin/$$branch"; \
	  printf '\n---\nRefreshed automatically whenever `%s` is updated from `next`.\n' "$$branch"; \
	} > "$$body"; \
	num="$$(gh pr list --base main --head "$$branch" --state open --json number --jq '.[0].number // empty')"; \
	if [ -n "$$num" ]; then \
	  gh pr edit "$$num" --body-file "$$body"; \
	  echo "refreshed release PR #$$num"; \
	else \
	  gh pr create --draft --base main --head "$$branch" \
	    --title "release: v$$version" --body-file "$$body"; \
	fi; \
	rm -f "$$body"

delete-branch: ## Delete a remote branch, tolerating one already gone (env: BRANCH)
	@set -eu; : "$${BRANCH:?BRANCH is required}"; \
	if gh api -X DELETE "repos/$(GH_REPO)/git/refs/heads/$$BRANCH" >/dev/null 2>&1; then \
	  echo "deleted $$BRANCH"; \
	else \
	  echo "$$BRANCH was already gone"; \
	fi

# --- releases ---------------------------------------------------------------

release: ## Run semantic-release: verify, tag and publish installers/** (CI only)
	bun run release

release-check: ## Fail unless package.json is the version semantic-release would cut from HEAD
	@set -eu; \
	want="$$($(MAKE) -s --no-print-directory next-version REF=HEAD)"; \
	have="$$($(pkg_version))"; \
	[ -n "$$want" ] \
	  || { echo "::error::no feat/fix/breaking commits since the last tag — nothing to release"; exit 1; }; \
	[ "$$want" = "$$have" ] \
	  || { echo "::error::commits call for v$$want but package.json is v$$have — re-cut the release branch"; exit 1; }; \
	echo "release check passed: v$$have"

# --- promotion (dev → next → release/v*) ------------------------------------

bootstrap-lanes: ## Create origin/dev and origin/next if they do not exist
	@set -eu; \
	git fetch --quiet --force --tags origin \
	  "+refs/heads/main:refs/remotes/origin/main"; \
	if git ls-remote --exit-code --heads origin next >/dev/null 2>&1; then \
	  echo "origin/next already exists"; \
	else \
	  git push origin refs/remotes/origin/main:refs/heads/next; \
	  echo "created origin/next from main"; \
	fi; \
	if git ls-remote --exit-code --heads origin dev >/dev/null 2>&1; then \
	  echo "origin/dev already exists"; \
	else \
	  ver="$$(git ls-remote --heads origin 'release/v*' \
	    | awk '{print $$2}' \
	    | sed 's|refs/heads/release/v||' \
	    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$$' \
	    | sort -t. -k1,1n -k2,2n -k3,3n \
	    | tail -1 || true)"; \
	  if [ -n "$$ver" ]; then src="release/v$$ver"; \
	  else src=main; \
	  fi; \
	  git fetch --quiet origin "+refs/heads/$$src:refs/remotes/origin/$$src"; \
	  git push origin "refs/remotes/origin/$$src:refs/heads/dev"; \
	  echo "created origin/dev from $$src"; \
	fi

promote-pr: ## Open or refresh the PR from dev into next (env: VERSION)
	@set -eu; \
	git fetch --quiet --force origin \
	  "+refs/heads/dev:refs/remotes/origin/dev" \
	  "+refs/heads/next:refs/remotes/origin/next"; \
	ahead="$$(git rev-list --count origin/next..origin/dev)"; \
	if [ "$$ahead" -eq 0 ]; then \
	  echo "dev is not ahead of next — nothing to promote"; \
	  exit 0; \
	fi; \
	: "$${VERSION:?VERSION is required}"; \
	stat="$$(git diff --shortstat origin/next...origin/dev || true)"; \
	body="$$(mktemp)"; \
	{ printf 'Promote **v%s** (semantic-release commit analysis).\n\n' "$$VERSION"; \
	  printf '<!-- corpora-release: v%s -->\n\n' "$$VERSION"; \
	  printf '%s\n' "$${stat:-0 files changed}"; \
	} > "$$body"; \
	num="$$(gh pr list --base next --head dev --state open --json number --jq '.[0].number // empty')"; \
	if [ -n "$$num" ]; then \
	  gh pr edit "$$num" --title "chore: promote v$$VERSION to next" --body-file "$$body"; \
	  echo "refreshed promote PR #$$num"; \
	else \
	  gh pr create --base next --head dev \
	    --title "chore: promote v$$VERSION to next" --body-file "$$body"; \
	  num="$$(gh pr list --base next --head dev --state open --json number --jq '.[0].number // empty')"; \
	  echo "opened promote PR #$$num"; \
	fi; \
	rm -f "$$body"; \
	gh pr merge "$$num" --auto --merge

cut-release: ## Cut or refresh release/v<VERSION> from origin/next (env: VERSION)
	@set -eu; \
	git fetch --quiet --force origin \
	  "+refs/heads/next:refs/remotes/origin/next" \
	  "+refs/heads/main:refs/remotes/origin/main"; \
	if git diff --quiet origin/main origin/next; then \
	  echo "next and main have the same tree — nothing to cut"; \
	  exit 0; \
	fi; \
	existing="$$(gh pr list --base main --state open --json headRefName \
	  --jq '[.[] | select(.headRefName | test("^release/v[0-9]"))] | .[0].headRefName // empty')"; \
	if [ -n "$$existing" ]; then \
	  version="$${existing#release/v}"; \
	  echo "in-flight $$existing — refreshing at v$$version"; \
	else \
	  if [ -z "$${VERSION-}" ]; then \
	    body="$$(gh pr list --base next --head dev --state merged --limit 1 \
	      --json body --jq '.[0].body // empty')"; \
	    VERSION="$$(printf '%s' "$$body" | sed -n 's/.*<!-- corpora-release: v\([0-9][0-9.]*\) -->.*/\1/p')"; \
	  fi; \
	  if [ -z "$${VERSION-}" ]; then \
	    VERSION="$$($(MAKE) -s --no-print-directory next-version REF=origin/next)"; \
	  fi; \
	  if [ -z "$${VERSION-}" ]; then \
	    echo "next has no feat/fix/breaking commits since the last tag — nothing to cut"; \
	    exit 0; \
	  fi; \
	  version="$$VERSION"; \
	fi; \
	branch="release/v$$version"; \
	if git fetch --quiet origin "+refs/heads/$$branch:refs/remotes/origin/$$branch" 2>/dev/null; then \
	  git checkout --quiet -B "$$branch" "origin/$$branch"; \
	  git merge --quiet --no-edit -X theirs origin/next; \
	else \
	  git checkout --quiet -B "$$branch" origin/next; \
	fi; \
	$(MAKE) -s --no-print-directory version-set VERSION="$$version"; \
	git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock; \
	if git diff --cached --quiet; then \
	  echo "package.json already $$version"; \
	else \
	  git commit --quiet -m "chore(release): open v$$version"; \
	fi; \
	git push --quiet -u origin "$$branch"; \
	echo "updated $$branch"

release-branch: ## Cut release/v<next> from origin/next (env: VERSION overrides the analysis)
	@$(MAKE) --no-print-directory cut-release VERSION="$(VERSION)"

sync-lanes: ## Merge origin/main into next and dev via PRs
	@set -eu; \
	$(MAKE) --no-print-directory bootstrap-lanes; \
	git fetch --quiet --force origin \
	  "+refs/heads/main:refs/remotes/origin/main" \
	  "+refs/heads/next:refs/remotes/origin/next" \
	  "+refs/heads/dev:refs/remotes/origin/dev"; \
	for lane in next dev; do \
	  head="chore/sync-main-into-$$lane"; \
	  git checkout --quiet -B "$$head" "origin/$$lane"; \
	  if git merge-base --is-ancestor origin/main HEAD; then \
	    echo "$$lane already contains main"; \
	    continue; \
	  fi; \
	  git merge --quiet --no-edit origin/main; \
	  git push --force-with-lease --quiet -u origin "$$head"; \
	  body="$$(mktemp)"; \
	  printf 'Sync **main** into `%s` after the production release.\n' "$$lane" > "$$body"; \
	  num="$$(gh pr list --base "$$lane" --head "$$head" --state open --json number --jq '.[0].number // empty')"; \
	  if [ -n "$$num" ]; then \
	    gh pr edit "$$num" --title "chore: sync main into $$lane" --body-file "$$body"; \
	    echo "refreshed sync PR #$$num into $$lane"; \
	  else \
	    gh pr create --base "$$lane" --head "$$head" \
	      --title "chore: sync main into $$lane" --body-file "$$body"; \
	    num="$$(gh pr list --base "$$lane" --head "$$head" --state open --json number --jq '.[0].number // empty')"; \
	    echo "opened sync PR #$$num into $$lane"; \
	  fi; \
	  rm -f "$$body"; \
	  gh pr merge "$$num" --auto --merge; \
	done

cleanup-cycle: ## Delete remote feature branches merged into dev, leftover release/v*
	@set -eu; \
	git fetch --quiet --prune origin; \
	git fetch --quiet --force origin "+refs/heads/dev:refs/remotes/origin/dev"; \
	for ref in $$(git branch -r --merged origin/dev \
	    | sed 's/^[[:space:]]*origin\///' \
	    | grep -E '^($(TYPES))/' || true); do \
	  $(MAKE) -s --no-print-directory delete-branch BRANCH="$$ref"; \
	done; \
	open="$$(gh pr list --base main --state open --json headRefName \
	  --jq '[.[].headRefName | select(startswith("release/v"))] | join(" ")')"; \
	for ref in $$(git ls-remote --heads origin 'release/v*' \
	    | awk '{print $$2}' | sed 's|refs/heads/||'); do \
	  case " $$open " in *" $$ref "*) continue ;; esac; \
	  $(MAKE) -s --no-print-directory delete-branch BRANCH="$$ref"; \
	done

cleanup-local: ## Delete local feature/release branches whose remotes are gone
	@set -eu; \
	git fetch --prune --quiet origin; \
	current="$$(git rev-parse --abbrev-ref HEAD)"; \
	for b in $$(git branch --format='%(refname:short)' \
	    | grep -E '^($(TYPES))/|^release/v' || true); do \
	  [ "$$b" = "$$current" ] && continue; \
	  if git ls-remote --exit-code --heads origin "$$b" >/dev/null 2>&1; then \
	    continue; \
	  fi; \
	  git branch -D "$$b"; \
	done

# --- repository settings ----------------------------------------------------

rulesets-diff: ## List the rulesets GitHub currently has, by id and name
	@gh api "repos/$(GH_REPO)/rulesets" --jq '.[] | "\(.id)\t\(.name)"'

rulesets-apply: ## Push .github/rulesets/*.json to GitHub (matched by name)
	@set -eu; \
	for f in .github/rulesets/*.json; do \
	  name="$$(node -p "require('./$$f').name")"; \
	  id="$$(gh api "repos/$(GH_REPO)/rulesets" --jq ".[] | select(.name==\"$$name\") | .id")"; \
	  if [ -n "$$id" ]; then \
	    gh api -X PUT "repos/$(GH_REPO)/rulesets/$$id" --input "$$f" >/dev/null; \
	    echo "updated $$name"; \
	  else \
	    gh api -X POST "repos/$(GH_REPO)/rulesets" --input "$$f" >/dev/null; \
	    echo "created $$name"; \
	  fi; \
	done
