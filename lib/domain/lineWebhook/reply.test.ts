import { describe, expect, it } from "vitest";
import {
  LINE_UNLINKED_GUIDANCE_MESSAGE,
  replyForCompletedImageJob,
  replyForImageSkipReason,
} from "./reply";

describe("replyForImageSkipReason", () => {
  it("全てのskip理由に対応する応答文を返す", () => {
    expect(replyForImageSkipReason("unlinked")).toBe(LINE_UNLINKED_GUIDANCE_MESSAGE);
    expect(replyForImageSkipReason("no_consent")).toContain("同意");
    expect(replyForImageSkipReason("no_group")).toBeTruthy();
    expect(replyForImageSkipReason("unresolved_group")).toBeTruthy();
    expect(replyForImageSkipReason("invalid_image")).toBeTruthy();
    expect(replyForImageSkipReason("too_large")).toBeTruthy();
    expect(replyForImageSkipReason("fetch_failed")).toBeTruthy();
  });
});

describe("replyForCompletedImageJob", () => {
  it("skippedジョブはskip理由の応答文を返す", () => {
    expect(replyForCompletedImageJob({ status: "skipped", skipReason: "unlinked" })).toBe(
      LINE_UNLINKED_GUIDANCE_MESSAGE,
    );
  });

  it("drafted/failedはレビューURL付きの応答文を返す", () => {
    expect(replyForCompletedImageJob({ status: "drafted", draftId: "d1" })).toContain("http");
    expect(replyForCompletedImageJob({ status: "failed", draftId: "d1" })).toContain("http");
  });

  it("skipReasonなし・未知状態はfetch失敗文へフォールバックする", () => {
    expect(replyForCompletedImageJob({ status: "skipped" })).toBe(
      replyForImageSkipReason("fetch_failed"),
    );
    expect(replyForCompletedImageJob({ status: "pending" })).toBe(
      replyForImageSkipReason("fetch_failed"),
    );
  });
});
