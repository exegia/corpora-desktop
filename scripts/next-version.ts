// Print the version semantic-release would publish if REF were merged into main,
// or nothing when REF has no releasable commits since the last vX.Y.Z tag.
// Mirrors semantic-release: the first release is 1.0.0.
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { commitAnalyzer } from "../release.config.mjs";

const ref = process.env.REF || process.argv[2] || "HEAD";
const git = (...args: string[]) => {
  const result = Bun.spawnSync(["git", ...args]);
  if (result.exitCode) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.toString();
};

const tags = git("tag", "--merged", ref, "-l", "v*")
  .split("\n")
  .map((tag) => tag.match(/^v(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number))
  .filter((parts): parts is number[] => parts !== undefined)
  .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
const last = tags.at(-1);

const range = last ? `v${last.join(".")}..${ref}` : ref;
const commits = git("log", "--format=%H%x1f%B%x1e", range)
  .split("\x1e")
  .map((entry) => entry.trim().split("\x1f"))
  .filter(([hash]) => hash)
  .map(([hash, message = ""]) => ({ hash, message }));

const silent = { log() {}, error() {}, success() {}, warn() {} };
const bump = await analyzeCommits(commitAnalyzer, { commits, logger: silent, cwd: process.cwd() });

if (bump) {
  const [major, minor, patch] = last ?? [];
  if (!last) console.log("1.0.0");
  else if (bump === "major") console.log(`${major + 1}.0.0`);
  else if (bump === "minor") console.log(`${major}.${minor + 1}.0`);
  else console.log(`${major}.${minor}.${patch + 1}`);
}
