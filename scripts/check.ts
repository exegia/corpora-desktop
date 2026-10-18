import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import ts from "typescript";
import { webSource } from "./web-source";
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const pkg = json("package.json");
const config = json("src-tauri/tauri.conf.json");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
assert.equal(cargo.match(/^version = "([^"]+)"/m)?.[1], pkg.version);
assert.equal(config.version, "../package.json");
assert.equal(config.build.devUrl, "http://127.0.0.1:1420");
assert.equal(config.build.frontendDist, "../dist");
assert.equal(config.build.beforeBuildCommand, "bun run web:build");
assert.match(json("web-source.json").ref, /^[a-f0-9]{40}$/);
console.log("Version and frontend contracts passed");

const typegen = Bun.spawnSync([process.execPath, "run", "--bun", "react-router", "typegen"], {
  cwd: webSource, stdout: "inherit", stderr: "inherit",
});
if (typegen.exitCode) process.exit(typegen.exitCode);

// Check the shipped entry graph. Retained, inactive template drafts are not
// part of Desktop's build. Resolve aliases against the selected Web checkout.
const parsed = ts.getParsedCommandLineOfConfigFile(resolve("tsconfig.json"), {
  paths: {
    "@/*": [resolve(webSource, "app/*")],
    "@corpora-web/*": [resolve(webSource, "app/*")],
  },
  rootDirs: [webSource, resolve(webSource, ".react-router/types")],
}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); } });
assert.ok(parsed);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const tooling = ts.getParsedCommandLineOfConfigFile(resolve("tsconfig.node.json"), {}, {
  ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n")); },
});
assert.ok(tooling);
const diagnostics = [
  ...parsed.errors, ...ts.getPreEmitDiagnostics(program),
  ...tooling.errors, ...ts.getPreEmitDiagnostics(ts.createProgram(tooling.fileNames, tooling.options)),
];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getCanonicalFileName: path => path,
    getNewLine: () => "\n",
  }));
  process.exit(1);
}
console.log("Desktop entry and imported Web source typecheck passed");
