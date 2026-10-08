import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireValue } from "./loop-policy.mjs";
import { loadTask } from "./loop/state.mjs";
import { recordMetric } from "./loop/metrics.mjs";
import { cliCommandName, run, summarizeTask } from "./loop/next.mjs";

function option(args, index) {
  requireValue(
    args[index + 1] && !args[index + 1].startsWith("--"),
    `${args[index]} requires a value`,
  );
  return args[index + 1];
}
export function parseArguments(args) {
  const out = {};
  const flags = new Set([
    "--export",
    "--assert-started",
    "--status",
    "--explain",
    "--artifacts",
    "--watch-aftercare",
    "--verify-required",
    "--full-review",
    "--hook-state",
    "--resolve-ci-failures",
    "--next",
  ]);
  const options = new Set([
    "--init",
    "--task",
    "--implementer",
    "--model",
    "--profile",
    "--runtime",
    "--base",
    "--state",
    "--event",
    "--exit",
    "--assessment",
    "--skills",
    "--verify",
    "--review",
    "--aftercare",
    "--check-pr",
    "--handled",
    "--spec",
    "--restore-pr",
    "--sync-pr",
    "--export-file",
    "--review-packet",
    "--delta-from",
    "--interval-seconds",
    "--scope",
    "--friction-note",
    "--record-usage",
    "--usage-role",
    "--external-findings",
    "--publish-metrics",
    "--ci-failures",
    "--draft",
    "--issue",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue; // pnpm forwards a bare "--" through to the script
    requireValue(flags.has(arg) || options.has(arg), `unknown option: ${arg}`);
    requireValue(!Object.hasOwn(out, arg.slice(2)), `duplicate option: ${arg}`);
    out[arg.slice(2)] = flags.has(arg) ? true : option(args, i++);
  }
  return out;
}
const recordCliOutput = (root, command, output, exit) => {
  let task = null;
  try {
    task = loadTask(root);
  } catch {
    task = null;
  }
  recordMetric(task, root, {
    action: "cli_output",
    command,
    outputBytes: Buffer.byteLength(output),
    exit,
  });
};
export function cliMain(
  argv,
  { root = process.cwd(), log = console.log, errorLog = console.error } = {},
) {
  let command = "unknown";
  try {
    const args = parseArguments(argv);
    command = cliCommandName(args);
    if (args.profile !== undefined)
      errorLog(
        "warning: --profile is deprecated and ignored; verification intensity comes from the tier/assessment",
      );
    const result = run(args, root);
    const output =
      typeof result === "string"
        ? result
        : JSON.stringify(result.version === 2 ? summarizeTask(result, root) : result, null, 2);
    log(output);
    // Measure what was emitted: the print call appends a trailing newline.
    recordCliOutput(root, command, `${output}\n`, 0);
    return 0;
  } catch (error) {
    // Force a string: a thrown non-Error with a truthy non-string .message would
    // otherwise make Buffer.byteLength throw inside this catch.
    const output = String(error?.message ?? error);
    errorLog(output);
    recordCliOutput(root, command, `${output}\n`, 1);
    return 1;
  }
}
export {
  artifactManifest,
  reviewerVerificationManifest,
  runRequiredVerification,
  runVerification,
} from "./loop/evidence.mjs";
export { metricsPath, publishTaskMetrics, recordMetric } from "./loop/metrics.mjs";
export {
  cliCommandName,
  defaultVerifyPrepush,
  resolveCiFailures,
  run,
  runNext,
  summarizeTask,
} from "./loop/next.mjs";
export {
  aftercareFetchers,
  aftercareSnapshot,
  collectFindingsArgs,
  derivePrTitle,
  discoverPrNumber,
  draftPrBody,
  ensureTaskPr,
  githubAftercare,
  inspectPullRequest,
  parseStateBlock,
  repositorySlugFromRemoteUrl,
  resolveRepositorySlug,
  restoreTask,
  snapshotEvent,
  syncPrStateBlock,
  watchAftercare,
} from "./loop/pr.mjs";
export {
  autoDeltaFrom,
  buildReviewPacket,
  collectReviewCiEvidence,
  waitForReviewCi,
} from "./loop/review.mjs";
export {
  CHECK_COMMANDS,
  DEFERRED_END,
  DEFERRED_START,
  STATE_BLOCK_RECENT_HISTORY,
  STATE_END,
  STATE_START,
  STATE_WORKFLOWS,
  acceptanceCriteriaHash,
  compactTaskForExport,
  deferredBlock,
  hydrateExportedTask,
  loadTask,
  readChangedPathsRevisioned,
  recordFailure,
  refreshTask,
  resolveLoopStep,
  resolveRuntime,
  saveTask,
  startTask,
  stateBlock,
  taskPath,
  transitionTask,
} from "./loop/state.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = cliMain(process.argv.slice(2));
}
