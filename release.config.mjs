// semantic-release runs on main after a release/vX.Y.Z PR merges (release.yml).
// It never pushes commits: cut-release already wrote the version into
// package.json/Cargo.toml, so it only verifies that version, tags it, and
// publishes the GitHub Release with the native installers.
// scripts/next-version.ts reuses this analyzer config to name release branches.

// Commits may carry a gitmoji prefix (`✨ feat: …`). Main only accepts merge
// commits, so a merge's PR title (checked by `make pr-guard`) counts too.
export const parserOpts = {
  headerPattern: /^(?:[^\w\s]+\s+)?(\w*)(?:\((.*)\))?!?: (.*)$/,
  breakingHeaderPattern: /^(?:[^\w\s]+\s+)?(\w*)(?:\((.*)\))?!: (.*)$/,
  mergePattern: /^Merge pull request #(\d+) from (\S+)$/,
  mergeCorrespondence: ["id", "source"],
};

export const commitAnalyzer = { preset: "conventionalcommits", parserOpts };

export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", commitAnalyzer],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits", parserOpts }],
    [
      "@semantic-release/exec",
      {
        verifyReleaseCmd:
          'test "$(make -s --no-print-directory pkg-version)" = "${nextRelease.version}" || { echo "package.json is not ${nextRelease.version}; re-cut the release branch" >&2; exit 1; }',
      },
    ],
    ["@semantic-release/github", { assets: [{ path: "installers/**" }] }],
  ],
};
