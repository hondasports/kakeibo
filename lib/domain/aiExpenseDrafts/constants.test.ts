import { describe, expect, it } from "vitest";
import {
  AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD,
  AI_EXPENSE_DRAFT_REVIEW_REASONS,
  AI_EXPENSE_DRAFT_STATUSES,
} from "./constants";

describe("AI expense draft constants", () => {
  it("下書き状態はキューから登録済みまでの固定状態に限定する", () => {
    expect(AI_EXPENSE_DRAFT_STATUSES).toEqual([
      "queued",
      "analyzing",
      "ready",
      "needs_review",
      "failed",
      "registered",
    ]);
  });

  it("reviewReasons は UI と分類ロジックで扱える固定理由に限定する", () => {
    expect(AI_EXPENSE_DRAFT_REVIEW_REASONS).toEqual([
      "low_confidence",
      "missing_required_field",
      "ambiguous_document_type",
      "ambiguous_category",
      "multiple_categories",
      "user_confirmation_required",
      "amount_mismatch",
      "parse_failed",
    ]);
  });

  it("分類しきい値をテスト可能な定数として公開する", () => {
    expect(AI_EXPENSE_DRAFT_CONFIDENCE_THRESHOLD).toBe(0.8);
  });
});
