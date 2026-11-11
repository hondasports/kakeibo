import type { ReceiptTaxInterpretation } from "../receipt/tax/types";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import type { AiExpenseDraftReviewReason } from "./constants";
import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { buildDraftListSummary } from "./listSummary";
import { mergeReviewReasons, nonTaxReviewReasons } from "./reviewReasons";

export function buildDraftReviewState(
  draft: AiExpenseDraftFields,
  items: AiExpenseDraftItemFields[],
  options: {
    reasons: AiExpenseDraftReviewReason[];
    preserveUserConfirmation?: boolean;
    interpretation?: ReceiptTaxInterpretation;
    mode?: "recompute" | "migration";
  },
) {
  const judgment = judgeDraftAmountAndTax(
    { ...draft, items: items.map((item) => ({ ...item, _id: item.id })) },
    { interpretation: options.interpretation },
  );
  const removeMismatch =
    options.mode === "migration" &&
    judgment.status === "resolved" &&
    options.reasons.includes("amount_mismatch");
  const preserved: AiExpenseDraftReviewReason[] = nonTaxReviewReasons(options.reasons);
  if (options.preserveUserConfirmation && options.reasons.includes("user_confirmation_required"))
    preserved.push("user_confirmation_required");
  const reviewReasons =
    options.mode === "migration"
      ? options.reasons.filter((reason) => !removeMismatch || reason !== "amount_mismatch")
      : mergeReviewReasons(preserved, judgment.reasons);
  const status =
    options.mode === "migration" && !removeMismatch
      ? draft.status === "ready"
        ? ("ready" as const)
        : ("needs_review" as const)
      : reviewReasons.length
        ? ("needs_review" as const)
        : ("ready" as const);
  return {
    status,
    reviewReasons,
    listSummary: buildDraftListSummary(draft, items, judgment.status === "resolved"),
    judgment,
  };
}
