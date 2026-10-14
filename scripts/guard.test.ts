import { expect, test } from "bun:test";
import pkg from "../package.json";
function guard(base: string, head: string, title: string) {
  return Bun.spawnSync(["make", "pr-guard"], { env: { ...process.env, BASE: base, HEAD: head, TITLE: title } });
}
test("feature branches target dev with conventional titles", () => {
  expect(guard("dev", "feat/init", "feat: initialize desktop").exitCode).toBe(0);
  expect(guard("dev", "feat/init", "invalid title").exitCode).not.toBe(0);
});
test("main rejects features and mismatched versions", () => {
  expect(guard("main", "feat/init", "feat: initialize").exitCode).not.toBe(0);
  expect(guard("main", "release/v9.9.9", "release: v9.9.9").exitCode).not.toBe(0);
  expect(guard("main", `release/v${pkg.version}`, `release: v${pkg.version}`).exitCode).toBe(0);
});
