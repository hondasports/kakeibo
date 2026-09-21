import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Review-depth vocabulary mirrored in docs/development-process.md and checked by tests. */
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
/** Cumulative review obligations, disclosed only for the selected tier. */
export const REVIEW_REQUIREMENTS = {
  T1: ["差分のスポットチェック", "変更に対応する検証の成功"],
  T2: ["変更ファイルの行単位diffレビュー", "エラー分岐の順序・互換export確認", "関連テスト成功"],
  T3: [
    "ベース版との分岐単位比較（挙動保存）またはロジック全トレース（変更）",
    "新設ポート/アダプタの意味論確認（undefinedキー・キャスト・往復変換）",
    "全エラーパスと共有callerの実検証",
  ],
};

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

/** Review requirements accumulate upward: T3 includes T1 and T2 obligations. */
export function reviewRequirements(tier) {
  return REVIEW_TIERS.slice(0, REVIEW_TIERS.indexOf(tier) + 1).flatMap(
    (t) => REVIEW_REQUIREMENTS[t],
  );
}

const nonempty = (value) => typeof value === "string" && value.trim().length > 0;

/** Validate model judgments before calculating the mechanical depth floor. */
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
    errors.push("risk_assessment.floor_triggers entries must match documented vocabulary");
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

/** Return the mechanical minimum tier and the cumulative requirements for the applied tier. */
export function assessReviewDepth(input) {
  const errors = validateAssessment(input);
  if (errors.length) throw new Error(`invalid assessment: ${errors.join("; ")}`);
  const minimum = reviewTierFloor(input.risk_assessment);
  const applied = input.applied_tier ?? minimum;
  return {
    minimum_tier: minimum,
    applied_tier: applied,
    requirements: reviewRequirements(applied),
  };
}

const USAGE = `使い方: node scripts/review-depth.mjs <入力>
  入力: 評価JSONファイルのパス、またはインラインJSON文字列
    {
      "risk_assessment": {
        "blast_radius": "local | several_surfaces | shared_or_system_wide",
        "data_security": "none | indirect | direct_boundary_change",
        "reversibility": "easy | procedural_rollback | difficult_or_stateful",
        "uncertainty": "known_pattern | some_unknowns | novel_or_impact_unclear",
        "floor_triggers": ["(下記の語彙のみ)"]
      },
      "tier_rationale": "評価の根拠",
      "applied_tier": "T1 | T2 | T3 (省略時は最低深度。引き上げのみ可)"
    }
  --vocabulary: 評価語彙（軸・強制条件・ティア）を返す

出力: { minimum_tier, applied_tier, requirements }
  実差分（未コミット・未追跡を含む）を評価し、applied_tierの確認項目でセルフレビューする。
  判定内容やレビュー実施の真偽はこのスクリプトでは保証しない。`;

/** Stateless CLI: vocabulary disclosure, or one assessment → tier floor and requirements. */
export function run(args, cwd = process.cwd()) {
  const [arg, ...rest] = args;
  if (rest.length) throw new Error("unexpected extra arguments");
  if (!arg || arg === "--help" || arg === "-h") return { usage: USAGE };
  if (arg === "--vocabulary")
    return { axes: REVIEW_AXES, floor_triggers: REVIEW_FLOOR_TRIGGERS, tiers: REVIEW_TIERS };
  const candidate = path.resolve(cwd, arg);
  const input = JSON.parse(existsSync(candidate) ? readFileSync(candidate, "utf8") : arg);
  return assessReviewDepth(input);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
