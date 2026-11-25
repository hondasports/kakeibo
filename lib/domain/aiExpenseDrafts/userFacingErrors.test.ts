import { RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR } from "../receiptAnalysisJobs/dailyUsage";
import { getReviewItemReplaceErrorMessage } from "./reviewItemReplace";
import { describe, expect, it } from "vitest";
import {
  getAiExpenseQueueDeleteErrorMessage,
  getAiExpenseQueueRegistrationErrorMessage,
  getAiExpenseQueueReviewErrorMessage,
  getDraftItemWindowErrorMessage,
} from "./userFacingErrors";

describe("AI 下書きキューのユーザー向けエラーメッセージ", () => {
  it("各操作のメッセージが空でない文字列を返す", () => {
    expect(getAiExpenseQueueRegistrationErrorMessage()).toBeTruthy();
    expect(getAiExpenseQueueDeleteErrorMessage()).toBeTruthy();
    expect(getAiExpenseQueueReviewErrorMessage()).toBeTruthy();
  });
});

it("判定窓超過のエラー内容だけ理由を表示する", () => {
  expect(
    getDraftItemWindowErrorMessage(
      getReviewItemReplaceErrorMessage("existing_items_exceed_window"),
    ),
  ).toContain("100件を超える");
  expect(getDraftItemWindowErrorMessage(new Error("unexpected"))).toBeUndefined();
});

it("日次上限の構造化エラーは翌日の案内を表示し、未知の内容は表示しない", () => {
  expect(getDraftItemWindowErrorMessage(RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR)).toBe(
    RECEIPT_ANALYSIS_DAILY_LIMIT_ERROR,
  );
  expect(getDraftItemWindowErrorMessage("[receipt_analysis:daily_limit]")).toBeUndefined();
  expect(getDraftItemWindowErrorMessage("internal database error")).toBeUndefined();
});
