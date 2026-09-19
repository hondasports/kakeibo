import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  realpathSync,
  writeFileSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Hash bytes or text without exposing source content in evidence identifiers. */
const hash = (value) => createHash("sha256").update(value).digest("hex");
/** Read a local JSON input; malformed data aborts the command. */
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
/** Require meaningful text for contract fields and manual evidence. */
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
/** Run Git without a shell, preserving NUL-delimited filename output. */
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed`);
  return args.includes("-z") ? r.stdout : r.stdout.trim();
}
/** Identify current tracked and nonignored content; reject tracked task state and unsupported submodules. */
export function fingerprint(cwd) {
  const tracked = git(cwd, ["ls-files", "-z", "--cached"]).split("\0");
  if (tracked.some((file) => file.startsWith(".loop/state/")))
    throw new Error("task state must remain ignored and untracked");
  const files = git(cwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
  const records = [...new Set(files)].sort().map((file) => {
    const absolute = path.join(cwd, file);
    if (!existsSync(absolute)) return [file, "deleted"];
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) throw new Error("Submodules require a separate fingerprint adapter");
    return [
      file,
      stat.mode,
      hash(stat.isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute)),
    ];
  });
  return hash(JSON.stringify(records));
}
/** Return contract shape and proof-reference errors without mutating the supplied contract. */
export function validateContract(c) {
  const errors = [];
  if (!c || typeof c !== "object") return ["contract is required"];
  for (const key of ["goal", "source", "environment"])
    if (!nonempty(c[key])) errors.push(`${key} is required`);
  if (!["local_verified", "pr_created", "merge_ready"].includes(c.delivery_target))
    errors.push("invalid delivery_target");
  for (const key of [
    "in_scope",
    "out_of_scope",
    "unresolved",
    "acceptance",
    "preserve",
    "checks",
    "controls",
  ]) {
    if (!Array.isArray(c[key])) errors.push(`${key} must be an array`);
  }
  if (errors.length) return errors;
  if (!c.in_scope.length || !c.in_scope.every(nonempty))
    errors.push("in_scope requires text entries");
  if (!c.out_of_scope.every(nonempty) || !c.unresolved.every(nonempty))
    errors.push("scope/unresolved entries must be text");
  if (!c.acceptance.length) errors.push("acceptance cannot be empty");
  const checks = new Set();
  for (const check of c.checks) {
    if (!check || !nonempty(check.id) || checks.has(check.id) || !nonempty(check.purpose))
      errors.push("invalid/duplicate check");
    checks.add(check?.id);
    if (!Array.isArray(check?.argv) || !check.argv.length || !check.argv.every(nonempty))
      errors.push("check argv must be non-empty strings");
    if (!Number.isInteger(check?.timeout_ms) || check.timeout_ms < 1 || check.timeout_ms > 3600000)
      errors.push("check timeout_ms must be 1..3600000");
  }
  const ids = new Set();
  for (const item of [...c.acceptance, ...c.preserve, ...c.controls]) {
    if (!item || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.expectation))
      errors.push("invalid/duplicate requirement or control");
    ids.add(item?.id);
    const proofs = item?.checks === undefined ? [] : item.checks;
    if (!Array.isArray(proofs)) errors.push("requirement checks must be an array");
    else if (proofs.some((id) => !checks.has(id))) errors.push("unknown verification check");
    if (Array.isArray(proofs) && !proofs.length && !nonempty(item?.manual))
      errors.push("requirement needs checks or an explicit manual verification method");
  }
  return errors;
}
/** Review-depth vocabulary; process.yaml mirrors the runtime and is checked by tests. */
export const REVIEW_AXES = {
  blast_radius: ["local", "several_surfaces", "shared_or_system_wide"],
  data_security: ["none", "indirect", "direct_boundary_change"],
  reversibility: ["easy", "procedural_rollback", "difficult_or_stateful"],
  uncertainty: ["known_pattern", "some_unknowns", "novel_or_impact_unclear"],
};
export const REVIEW_FLOOR_TRIGGERS = [
  "authentication_or_authorization",
  "schema_or_migration",
  "data_deletion_or_retention",
  "complex_state_transition_or_orchestration_port",
  "cross_domain_shared_caller_change",
  "external_service_write_or_webhook",
  "destructive_or_irreversible_operation",
];
export const REVIEW_TIERS = ["T1", "T2", "T3"];
/** Minimum self-review depth implied by a risk assessment: any floor trigger or extreme axis value forces T3, any middle value forces T2. */
export function reviewTierFloor(assessment) {
  const values = Object.values(REVIEW_AXES).map((allowed, index) => ({
    allowed,
    value: assessment?.[Object.keys(REVIEW_AXES)[index]],
  }));
  if (
    (assessment?.floor_triggers ?? []).length > 0 ||
    values.some(({ allowed, value }) => value === allowed.at(-1))
  )
    return "T3";
  if (values.some(({ allowed, value }) => value === allowed.at(-2))) return "T2";
  return "T1";
}
/** Validate model judgments before calculating a mechanical depth floor. */
export function validateAssessment(input) {
  const errors = [];
  const assessment = input?.risk_assessment;
  if (!nonempty(input?.tier_rationale)) errors.push("tier_rationale is required");
  if (!assessment || typeof assessment !== "object")
    return [...errors, "risk_assessment is required"];
  for (const [axis, allowed] of Object.entries(REVIEW_AXES))
    if (!allowed.includes(assessment[axis]))
      errors.push(`risk_assessment.${axis} must be one of ${allowed.join("/")}`);
  if (!Array.isArray(assessment.floor_triggers))
    errors.push("risk_assessment.floor_triggers must be an array");
  else if (assessment.floor_triggers.some((t) => !REVIEW_FLOOR_TRIGGERS.includes(t)))
    errors.push("risk_assessment.floor_triggers entries must match process.yaml vocabulary");
  if (input?.applied_tier !== undefined && !REVIEW_TIERS.includes(input.applied_tier))
    errors.push("applied_tier must be one of T1/T2/T3");
  if (
    !errors.length &&
    input.applied_tier !== undefined &&
    REVIEW_TIERS.indexOf(input.applied_tier) < REVIEW_TIERS.indexOf(reviewTierFloor(assessment))
  )
    errors.push(
      `applied_tier is below the ${reviewTierFloor(assessment)} floor implied by risk_assessment`,
    );
  return errors;
}

/** Cumulative review obligations, disclosed only for the selected tier. */
export const REVIEW_REQUIREMENTS = {
  T1: ["差分のスポットチェック", "契約の全check成功"],
  T2: ["変更ファイルの行単位diffレビュー", "エラー分岐の順序・互換export確認", "関連テスト成功"],
  T3: [
    "ベース版との分岐単位比較（挙動保存）またはロジック全トレース（変更）",
    "新設ポート/アダプタの意味論確認（undefinedキー・キャスト・往復変換）",
    "全エラーパスと共有callerの実検証",
  ],
};
function reviewRequirements(tier) {
  return REVIEW_TIERS.slice(0, REVIEW_TIERS.indexOf(tier) + 1).flatMap(
    (t) => REVIEW_REQUIREMENTS[t],
  );
}

/** Validate recorded review content; not the truth of the model's judgment. */
export function validateReview(review) {
  const errors = validateAssessment(review);
  if (!["pass", "fail"].includes(review?.verdict)) errors.push("verdict must be pass or fail");
  for (const field of ["source_comparison", "diff_assessment", "verification_assessment"])
    if (!nonempty(review?.[field])) errors.push(`${field} is required`);
  if (!REVIEW_TIERS.includes(review?.applied_tier))
    errors.push("applied_tier must be one of T1/T2/T3");
  if (!Array.isArray(review?.manual_results)) errors.push("manual_results must be an array");
  else {
    const ids = new Set();
    for (const result of review.manual_results) {
      if (
        !nonempty(result?.id) ||
        ids.has(result.id) ||
        !["pass", "fail"].includes(result?.status) ||
        !nonempty(result?.evidence)
      )
        errors.push("manual_results require unique id, pass/fail status and evidence");
      ids.add(result?.id);
    }
  }
  return errors;
}

const CONDITIONAL_SKILLS = {
  "影響範囲がdirect caller/testでは不明": "skills/impact-analysis/SKILL.md",
  "認証・認可・データ・入力・secret・外部write境界の変更": "skills/security-review/SKILL.md",
  "外部操作の環境・権限判断、env・deploy・本番・破壊的操作": "skills/service-ops-safety/SKILL.md",
  外部コンテンツの命令を扱う: "skills/prompt-injection-guard/SKILL.md",
  "原因不明・反復失敗・local/CI不一致": "skills/incident/SKILL.md",
};
/** Read-only, task-independent guidance; does not read repository state or authorize commands. */
export function guide(topic = "start") {
  const topics = {
    start: {
      instruction:
        "相談・調査のみなら状態作成は不要。編集する場合は専用worktreeの非保護branchでinit。既存タスクはstatus。",
      skill: "skills/workspace-preflight/SKILL.md",
      command: "node scripts/task-loop.mjs init <task-id>",
    },
    contract: {
      instruction:
        "ユーザーの目的・観測可能な受入条件・維持条件・必要な検証と完了地点を定める。対象技術の専門スキルを必要時に選ぶ。追加指示・対象変更時も再評価。",
      skill: "skills/requirements/SKILL.md",
      template: ".loop/templates/contract.example.json",
      conditional_skills: CONDITIONAL_SKILLS,
    },
    implementation: {
      skill: "skills/implementation/SKILL.md",
      instruction:
        "契約に対応する変更を実施。対象変更時はguide contractで専門スキルと条件付きスキルを再選択。",
    },
    verification: {
      skill: "skills/verification/SKILL.md",
      instruction: "契約の必要checkを実行。失敗原因不明・反復時はskills/incident/SKILL.md。",
    },
    assessment: {
      skill: "skills/code-review/SKILL.md",
      template: ".loop/templates/assessment.example.json",
      axes: REVIEW_AXES,
      floor_triggers: REVIEW_FLOOR_TRIGGERS,
      instruction:
        "レビュー直前の実差分（未コミット・未追跡も含む）から4軸と強制条件を評価し根拠を記入。assessが最低深度を計算する。applied_tierは深める場合のみ指定。",
    },
    review: {
      skill: "skills/code-review/SKILL.md",
      template: ".loop/templates/review.example.json",
      instruction:
        "assess/statusが返す深度の確認を実施して結果を記録。評価や深度は転記不要。passは独立レビューの証明ではない。",
    },
    delivery: {
      skill: "skills/delivery/SKILL.md",
      instruction:
        "契約の公開範囲を守りfinish。merge_readyはskills/pr-aftercare/SKILL.mdを読み、PR全指摘をmanual Controlで確認。",
    },
  };
  if (!Object.hasOwn(topics, topic))
    throw new Error(`unknown guide topic; choose ${Object.keys(topics).join(", ")}`);
  return { topic, ...topics[topic] };
}

/** Return one actionable stage, without replaying history or expanding every skill. */
export function nextAction(state, key) {
  const id = state.id;
  const command = (action, ...args) => ["node", "scripts/task-loop.mjs", action, id, ...args];
  if (!state.contract || validateContract(state.contract).length)
    return {
      stage: "contract",
      command: command("contract", `.loop/state/${id}/contract.json`),
      guide: "contract",
    };
  if (state.contract.unresolved.length)
    return {
      stage: "contract",
      guide: "contract",
      instruction: "未解決事項を調査。依存する実装・検証のみ停止。契約更新には理由が必要。",
    };
  const missing = blockers(state, key);
  const check = state.contract.checks.find((c) => missing.includes(`check required: ${c.id}`));
  if (check)
    return {
      stage: "verification",
      command: command("check", check.id),
      guide: "verification",
      instruction: "実装を終えてから実行。失敗は原因を修正して再実行。",
    };
  const finding = state.findings.find((f) => f.status === "open");
  if (finding)
    return {
      stage: "finding",
      id: finding.id,
      instruction: "指摘の修正確認か不成立の根拠を記録する。",
      command: command("finding", `.loop/state/${id}/finding.json`),
    };
  const assessment = state.assessments?.at(-1);
  if (!assessment || assessment.key !== key)
    return {
      stage: "assessment",
      command: command("assess", `.loop/state/${id}/assessment.json`),
      guide: "assessment",
    };
  if (missing.length)
    return {
      stage: "review",
      command: command("review", `.loop/state/${id}/review.json`),
      guide: "review",
      applied_tier: assessment.applied_tier,
      requirements: reviewRequirements(assessment.applied_tier),
    };
  return {
    stage: "delivery",
    command: command(
      "finish",
      ...(state.contract.delivery_target === "local_verified" ? [] : ["<PR-URL>"]),
    ),
    guide: "delivery",
    instruction: "ローカル証拠が揃った状態。PR状態はfinishで観測するまで未確認。",
  };
}
/** Bind evidence to file content, the contract, and observable runtime identity. */
export function evidenceKey(cwd, contract) {
  return hash(
    JSON.stringify({
      loop_version: 14,
      content: fingerprint(cwd),
      contract,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    }),
  );
}
/** Compute missing current proof, manual judgments, and unresolved findings for completion. */
export function blockers(state, key) {
  const errors = validateContract(state.contract);
  if (errors.length) return errors;
  errors.push(...state.contract.unresolved.map((x) => `unresolved: ${x}`));
  for (const check of state.contract.checks) {
    const runs = state.runs.filter((r) => r.check === check.id && r.key === key);
    if (!runs.length || runs.at(-1).exit_code !== 0 || runs.at(-1).invalidated)
      errors.push(`check required: ${check.id}`);
  }
  const assessment = state.assessments?.at(-1);
  if (!assessment || assessment.key !== key) errors.push("current risk assessment required");
  const review = state.reviews.at(-1);
  if (
    !review ||
    review.key !== key ||
    review.assessment_id !== assessment?.id ||
    review.verdict !== "pass"
  )
    errors.push("current self-review required");
  const manual = [
    ...state.contract.acceptance,
    ...state.contract.preserve,
    ...state.contract.controls,
  ].filter((x) => nonempty(x.manual));
  for (const item of manual) {
    if (
      !review?.manual_results?.some(
        (r) => r.id === item.id && nonempty(r.evidence) && r.status === "pass",
      )
    )
      errors.push(`manual proof required: ${item.id}`);
  }
  for (const finding of state.findings)
    if (finding.status === "open") errors.push(`open finding: ${finding.id}`);
  return errors;
}
/** Atomically replace local state for the single-writer loop; this is not tamper protection. */
function save(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temporary, file);
}
/** Mask known environment credentials and common token formats in local logs; not a complete secret scanner. */
function redact(text) {
  let value = String(text);
  for (const [key, secret] of Object.entries(process.env)) {
    if (/secret|token|password|credential|api.?key/i.test(key) && secret?.length >= 4)
      value = value.split(secret).join("[REDACTED]");
  }
  return value.replace(/\b(?:gh[pousr]_[\w]+|sk-[\w-]+)\b/g, "[REDACTED]");
}
/** Reject mismatched PR identity and enforce the requested delivery target conservatively. */
export function validatePr(pr, { head, branch, base, target }) {
  if (
    pr.state !== "OPEN" ||
    pr.headRefOid !== head ||
    pr.headRefName !== branch ||
    pr.baseRefName !== base
  )
    throw new Error("PR identity/head/base mismatch");
  if (target !== "merge_ready") return;
  if (
    pr.isDraft ||
    pr.mergeable !== "MERGEABLE" ||
    pr.mergeStateStatus !== "CLEAN" ||
    !["", "APPROVED"].includes(pr.reviewDecision)
  )
    throw new Error("PR is not merge-ready");
  if (
    !Array.isArray(pr.statusCheckRollup) ||
    pr.statusCheckRollup.some((c) =>
      c.__typename === "CheckRun"
        ? c.status !== "COMPLETED" || !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(c.conclusion)
        : c.__typename !== "StatusContext" || c.state !== "SUCCESS",
    )
  )
    throw new Error("checks incomplete or failing");
}
/** Compare a PR URL repository boundary against a resolved GitHub owner/name. */
export function matchesRepository(url, repository) {
  return (
    typeof repository === "string" &&
    /^[^/]+\/[^/]+$/.test(repository) &&
    typeof url === "string" &&
    url.toLowerCase().startsWith(`https://github.com/${repository.toLowerCase()}/pull/`)
  );
}
/** Read canonical origin and PR identity through GitHub CLI, rejecting dirty or mismatched publication state. */
function observePr(cwd, url) {
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(url))
    throw new Error("expected a GitHub PR URL");
  const remote = git(cwd, ["remote", "get-url", "origin"]);
  const repo = remote.match(/(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
  if (!repo) throw new Error("origin must be a GitHub repository");
  const resolved = spawnSync("gh", ["repo", "view", repo, "--json", "nameWithOwner"], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  if (resolved.status !== 0) throw new Error("cannot resolve origin repository");
  const canonical = JSON.parse(resolved.stdout).nameWithOwner;
  if (!matchesRepository(url, repo) && !matchesRepository(url, canonical))
    throw new Error("PR repository does not match origin");
  const fields =
    "url,state,headRefOid,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup";
  const result = spawnSync("gh", ["pr", "view", url, "--json", fields], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0) throw new Error("GitHub observation failed");
  const pr = JSON.parse(result.stdout);
  if (!matchesRepository(pr.url, canonical)) throw new Error("observed PR repository mismatch");
  if (
    pr.state !== "OPEN" ||
    pr.headRefOid !== git(cwd, ["rev-parse", "HEAD"]) ||
    pr.headRefName !== git(cwd, ["branch", "--show-current"])
  )
    throw new Error("PR identity/head mismatch");
  if (git(cwd, ["status", "--porcelain"]))
    throw new Error("publish evidence requires a clean worktree");
  return pr;
}
/** Execute one task command, persisting actual check results or explicit judgments and rejecting incomplete delivery. */
export function run(args, cwd = process.cwd()) {
  const [command, id, ...rest] = args;
  if (command === "guide") return guide(id);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id ?? ""))
    throw new Error(
      "usage: task-loop <init|contract|check|assess|review|finding|status|finish> <task-id> [arguments]",
    );
  const worktreeRoot = realpathSync(path.resolve(git(cwd, ["rev-parse", "--show-toplevel"])));
  const workingDirectory = realpathSync(path.resolve(cwd));
  if (worktreeRoot.toLowerCase() !== workingDirectory.toLowerCase())
    throw new Error("run from worktree root");
  const directory = path.join(cwd, ".loop", "state", id);
  const file = path.join(directory, "state.json");
  if (command === "init") {
    if (existsSync(file)) throw new Error("task already exists");
    const preflight = spawnSync(
      process.execPath,
      ["scripts/check-task-worktree.mjs", "--require-clean"],
      { cwd, encoding: "utf8" },
    );
    if (preflight.status !== 0) throw new Error("workspace preflight failed");
    mkdirSync(directory, { recursive: true });
    save(file, {
      version: 14,
      id,
      branch: git(cwd, ["branch", "--show-current"]),
      contract: null,
      runs: [],
      reviews: [],
      assessments: [],
      findings: [],
      history: [{ event: "init", at: new Date().toISOString() }],
    });
    return {
      status: "initialized",
      id,
      next: {
        stage: "contract",
        guide: "contract",
        command: [
          "node",
          "scripts/task-loop.mjs",
          "contract",
          id,
          `.loop/state/${id}/contract.json`,
        ],
      },
    };
  }
  const state = json(file);
  if (
    ![13, 14].includes(state.version) ||
    state.id !== id ||
    state.branch !== git(cwd, ["branch", "--show-current"])
  )
    throw new Error("task identity mismatch");
  if (command === "status") {
    const key = evidenceKey(cwd, state.contract);
    return {
      status: "observed",
      key,
      blockers: blockers(state, key),
      delivery_target: state.contract?.delivery_target ?? null,
      next: nextAction(state, key),
    };
  }
  const event = { event: command, at: new Date().toISOString() };
  if (command === "contract") {
    const contract = json(rest[0]);
    const errors = validateContract(contract);
    if (errors.length) throw new Error(errors.join("; "));
    if (state.contract && !nonempty(rest[1]))
      throw new Error("contract revision requires a reason");
    event.previous = state.contract;
    event.reason = rest[1] ?? "initial contract";
    state.contract = contract;
  } else {
    const errors = validateContract(state.contract);
    if (errors.length) throw new Error(errors.join("; "));
    const key = evidenceKey(cwd, state.contract);
    if (command === "check") {
      if (state.contract.unresolved.length)
        throw new Error("resolve material questions before verification");
      const check = state.contract.checks.find((x) => x.id === rest[0]);
      if (!check) throw new Error("unknown check");
      const started = Date.now();
      const result = spawnSync(check.argv[0], check.argv.slice(1), {
        cwd,
        encoding: "utf8",
        timeout: check.timeout_ms,
        maxBuffer: 16 * 1024 * 1024,
        shell: false,
      });
      const log = `${randomUUID()}.log`;
      writeFileSync(
        path.join(directory, log),
        redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`),
      );
      const record = {
        check: check.id,
        key,
        argv: check.argv,
        exit_code: result.status,
        signal: result.signal,
        duration_ms: Date.now() - started,
        log,
        invalidated: key !== evidenceKey(cwd, state.contract),
      };
      state.runs.push(record);
      event.result = record;
    } else if (command === "assess") {
      const input = json(rest[0]);
      const errors = validateAssessment(input);
      if (errors.length) throw new Error(`invalid assessment: ${errors.join("; ")}`);
      const minimum = reviewTierFloor(input.risk_assessment);
      const assessment = {
        id: randomUUID(),
        key,
        at: event.at,
        risk_assessment: input.risk_assessment,
        tier_rationale: input.tier_rationale,
        minimum_tier: minimum,
        applied_tier: input.applied_tier ?? minimum,
      };
      state.assessments ??= [];
      state.assessments.push(assessment);
      event.assessment = assessment;
    } else if (command === "review") {
      const assessment = state.assessments?.at(-1);
      if (!assessment || assessment.key !== key)
        throw new Error("current risk assessment required; run assess before review");
      const input = json(rest[0]);
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("invalid review: object is required");
      for (const field of ["risk_assessment", "tier_rationale", "applied_tier"])
        if (Object.hasOwn(input, field))
          throw new Error(`review must not override ${field}; run assess first`);
      const review = {
        ...input,
        risk_assessment: assessment.risk_assessment,
        tier_rationale: assessment.tier_rationale,
        applied_tier: assessment.applied_tier,
      };
      const errors = validateReview(review);
      if (errors.length) throw new Error(`invalid review: ${errors.join("; ")}`);
      state.reviews.push({
        ...review,
        assessment_id: assessment.id,
        key,
        kind: "self",
        at: event.at,
      });
    } else if (command === "finding") {
      const finding = json(rest[0]);
      if (
        !nonempty(finding.id) ||
        !nonempty(finding.description) ||
        !["open", "resolved", "not_applicable"].includes(finding.status) ||
        !nonempty(finding.evidence)
      )
        throw new Error("invalid finding");
      const previous = state.findings.findIndex((x) => x.id === finding.id);
      event.previous = previous < 0 ? null : state.findings[previous];
      if (previous < 0) state.findings.push({ ...finding, key });
      else state.findings[previous] = { ...finding, key };
    } else if (command === "finish") {
      const missing = blockers(state, key);
      if (missing.length) throw new Error(missing.join("; "));
      if (state.contract.delivery_target !== "local_verified") {
        const pr = observePr(cwd, rest[0]);
        validatePr(pr, {
          head: git(cwd, ["rev-parse", "HEAD"]),
          branch: state.branch,
          base: state.contract.base_branch ?? "preview",
          target: state.contract.delivery_target,
        });
        if (evidenceKey(cwd, state.contract) !== key)
          throw new Error("content changed during PR observation");
        event.pr = pr;
      }
      event.key = key;
    } else throw new Error("unknown command");
  }
  state.version = 14;
  state.history.push(event);
  save(file, state);
  if (command === "check" && (event.result.exit_code !== 0 || event.result.invalidated))
    throw new Error("check failed or content changed during check; inspect local log");
  if (command === "assess")
    return {
      status: "recorded",
      id,
      event: command,
      minimum_tier: event.assessment.minimum_tier,
      applied_tier: event.assessment.applied_tier,
      requirements: reviewRequirements(event.assessment.applied_tier),
      next: { stage: "review", guide: "review" },
    };
  return {
    status: command === "finish" ? "complete" : "recorded",
    id,
    event: command,
    ...(command === "contract"
      ? { next: { stage: "implementation", guide: "implementation" } }
      : {}),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
