import { existsSync } from "node:fs";
import { resolve } from "node:path";
const web = resolve(import.meta.dir, "../../corpora-web");
if (!existsSync(resolve(web, "package.json"))) throw new Error("Clone corpora-web beside corpora-desktop and run bun install there first.");
const mode = process.argv[2];
if (mode !== "dev" && mode !== "build") throw new Error("Expected dev or build");
// CI supplies public VITE_* variables directly; local development uses web's dotenvx setup.
const args = mode === "dev"
  ? ["run", "dev", "--host", "localhost", "--port", "1420", "--strictPort"]
  : process.env.CI ? ["x", "react-router", "build"] : ["run", "build"];
const child = Bun.spawn([process.execPath, ...args], {
  cwd: web, stdin: "inherit", stdout: "inherit", stderr: "inherit",
  env: { ...process.env, PORT: "1420", BROWSER: "none" },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
process.exit(await child.exited);
