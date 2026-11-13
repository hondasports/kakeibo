import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
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
});
