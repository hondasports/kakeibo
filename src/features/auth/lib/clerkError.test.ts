import { afterEach, describe, expect, it, vi } from "vitest";
import { getClerkErrorMessage } from "./clerkError";

describe("getClerkErrorMessage", () => {
  it("longMessage が存在するときは longMessage を返す", () => {
    const error = { errors: [{ longMessage: "Long message", message: "Short message" }] };
    expect(getClerkErrorMessage(error, "Fallback")).toBe("Long message");
  });

  it("longMessage がなく message があるときは message を返す", () => {
    const error = { errors: [{ message: "Short message" }] };
    expect(getClerkErrorMessage(error, "Fallback")).toBe("Short message");
  });

  it("errors 配列が空のときはフォールバックを返す", () => {
    const error = { errors: [] };
    expect(getClerkErrorMessage(error, "Fallback message")).toBe("Fallback message");
  });

  it("errors プロパティがないときはフォールバックを返す", () => {
    const error = {};
    expect(getClerkErrorMessage(error, "Fallback message")).toBe("Fallback message");
  });

  it("undefined のときはフォールバックを返す", () => {
    expect(getClerkErrorMessage(undefined, "Fallback message")).toBe("Fallback message");
  });

  describe("userFacingOnly", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("本番（DEV=false）では生メッセージを出さずフォールバックを返す", () => {
      vi.stubEnv("DEV", false);
      const error = { errors: [{ longMessage: "Raw clerk message" }] };
      expect(getClerkErrorMessage(error, "Fallback", { userFacingOnly: true })).toBe("Fallback");
    });

    it("開発環境（DEV=true）では生メッセージを返す", () => {
      vi.stubEnv("DEV", true);
      const error = { errors: [{ longMessage: "Raw clerk message" }] };
      expect(getClerkErrorMessage(error, "Fallback", { userFacingOnly: true })).toBe(
        "Raw clerk message",
      );
    });

    it("userFacingOnly でなければ本番でも生メッセージを返す", () => {
      vi.stubEnv("DEV", false);
      const error = { errors: [{ longMessage: "Raw clerk message" }] };
      expect(getClerkErrorMessage(error, "Fallback")).toBe("Raw clerk message");
    });
  });
});
