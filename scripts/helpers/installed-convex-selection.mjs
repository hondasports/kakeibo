import { readFileSync, existsSync } from "node:fs";
import { Module } from "node:module";
import { dirname } from "node:path";

// CLIの非公開resolverを検証する。entrypointを実行するとbackendを起動するため除外する。
const [bundlePath, envFile] = process.argv.slice(2);
const source = readFileSync(bundlePath, "utf8");
const entrypoint = "\nvoid main();";
if (source.split(entrypoint).length !== 2) {
  throw new Error("Convex CLI entrypoint changed; review the selection fixture before running it");
}
const cli = new Module(bundlePath);
cli.filename = bundlePath;
cli.paths = Module._nodeModulePaths(dirname(bundlePath));
cli._compile(
  source.replace(entrypoint, "\nmodule.exports = { getDeploymentSelection };"),
  bundlePath,
);

const selection = await cli.exports.getDeploymentSelection(
  {
    fs: { exists: existsSync, readUtf8File: (file) => readFileSync(file, "utf8") },
    bigBrainAuth: () => null,
    crash: () => {
      throw new Error("Deployment selection rejected");
    },
  },
  envFile ? { envFile } : {},
);
process.stdout.write(
  JSON.stringify({ kind: selection.kind, deploymentName: selection.deploymentName }),
);
