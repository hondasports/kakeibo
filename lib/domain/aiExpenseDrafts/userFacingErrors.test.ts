import { describe, expect, it } from "vitest";
import {
  getAiExpenseQueueDeleteErrorMessage,
  getAiExpenseQueueRegistrationErrorMessage,
  getAiExpenseQueueReviewErrorMessage,
} from "./userFacingErrors";

describe("AI 下書きキューのユーザー向けエラーメッセージ", () => {
  it("各操作のメッセージが空でない文字列を返す", () => {
    expect(getAiExpenseQueueRegistrationErrorMessage()).toBeTruthy();
    expect(getAiExpenseQueueDeleteErrorMessage()).toBeTruthy();
    expect(getAiExpenseQueueReviewErrorMessage()).toBeTruthy();
  });
});
