import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyLineDefaultRichMenu } from "../lib/convex/lineWebhook/lineRichMenuClient.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_IMAGE_PATH = resolve(repoRoot, "docs/line/rich-menu-readonly-summary.png");

function parseArguments(args: string[]) {
  const options = { dryRun: true, imagePath: DEFAULT_IMAGE_PATH };
  for (const arg of args) {
    if (arg === "--") continue;
    if (arg === "--apply") options.dryRun = false;
    else if (arg.startsWith("--image=")) options.imagePath = resolve(repoRoot, arg.slice(8));
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const imageBytes = readFileSync(options.imagePath);
  const result = await applyLineDefaultRichMenu({
    imageBytes,
    dryRun: options.dryRun,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "LINE rich menu apply failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
