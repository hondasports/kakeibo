import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR } from "../../../../lib/domain/receiptAnalysisJobs/dailyUsage";
import { getReviewItemReplaceErrorMessage } from "../../../../lib/domain/aiExpenseDrafts/reviewItemReplace";
import { getDraftItemWindowErrorMessage } from "./draftItemWindowError";

describe("下書きの明細上限エラー", () => {
  it("該当する ConvexError だけを表示用の理由に変換する", () => {
    const data = getReviewItemReplaceErrorMessage("existing_items_exceed_window");
    expect(getDraftItemWindowErrorMessage(new ConvexError(data))).toContain("100件を超える");
    expect(getDraftItemWindowErrorMessage(new ConvexError("other"))).toBeUndefined();
    expect(getDraftItemWindowErrorMessage(new Error(data))).toBeUndefined();
    expect(getDraftItemWindowErrorMessage({ data })).toBeUndefined();
  });

  it("日次上限の ConvexError は data から翌日の案内を取り出す", () => {
    // サーバーは message を再構成するため、利用者向けの文言は data で届く形を確認する
    expect(
      getDraftItemWindowErrorMessage(new ConvexError(RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR)),
    ).toBe(RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR);
  });
});
