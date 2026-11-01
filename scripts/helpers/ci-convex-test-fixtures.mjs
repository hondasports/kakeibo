/**
 * `scripts/lib/ci-convex-*.test.mjs` が共有するテスト用fixture。
 * installed CLIのdeployment選択を検証する `selectedDeployment` と、
 * local専用 `.env.local` / cloud selector のダミー値を置く。
 * secretは全てdummy値で、実環境の値は使わない。
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export const LOCAL_ENV_CONTENT = [
  "CONVEX_DEPLOYMENT=local:anonymous-test",
  "VITE_CONVEX_URL=http://127.0.0.1:3210",
  "VITE_CONVEX_SITE_URL=http://127.0.0.1:3211",
].join("\n");

const require = createRequire(import.meta.url);
const convexBundle = path.resolve(
  path.dirname(require.resolve("convex/package.json")),
  "dist/cli.bundle.cjs",
);
const selectionFixture = path.resolve("scripts/helpers/installed-convex-selection.mjs");
export const CLOUD_SELECTORS = [
  ["deploy key", { CONVEX_DEPLOY_KEY: "preview:dummy-team:dummy-project|dummy-key" }],
  ["deployment token", { CONVEX_DEPLOYMENT_TOKEN: "preview:dummy-team:dummy-project|dummy-token" }],
  ["deployment", { CONVEX_DEPLOYMENT: "prod:dummy-cloud" }],
  ["project key", { CONVEX_DEPLOY_KEY: "project:dummy-project|dummy-key" }],
  [
    "self hosted",
    {
      CONVEX_SELF_HOSTED_URL: "https://dummy.invalid",
      CONVEX_SELF_HOSTED_ADMIN_KEY: "dummy-admin",
    },
  ],
];

export function selectedDeployment(cwd, args, env) {
  const index = args.indexOf("--env-file");
  return JSON.parse(
    execFileSync(
      process.execPath,
      [selectionFixture, convexBundle, ...(index < 0 ? [] : [args[index + 1]])],
      { cwd, env, encoding: "utf8", timeout: 10000 },
    ),
  );
}
