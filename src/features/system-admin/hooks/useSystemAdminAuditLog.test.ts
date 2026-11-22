import { describe, expect, it } from "vitest";
import { isInvalidConvexIdInput } from "./useSystemAdminAuditLog";

describe("isInvalidConvexIdInput", () => {
  it("空欄は無効扱いしない（フィルタ未入力）", () => {
    expect(isInvalidConvexIdInput("")).toBe(false);
    expect(isInvalidConvexIdInput("   ")).toBe(false);
  });

  it("Crockford base32 の31文字IDを受け付ける", () => {
    expect(isInvalidConvexIdInput("0a1b2c3d4e5f6g7h8j9kmnpqrstvwxy")).toBe(false);
  });

  it("37文字のIDを受け付ける", () => {
    expect(isInvalidConvexIdInput("0a1b2c3d4e5f6g7h8j9kmnpqrstvwxyz12345")).toBe(false);
  });

  it("30文字以下・38文字以上は形式エラー", () => {
    expect(isInvalidConvexIdInput("0a1b2c3d4e5f6g7h8j9kmnpqrstvwx")).toBe(true);
    expect(isInvalidConvexIdInput("0a1b2c3d4e5f6g7h8j9kmnpqrstvwxyz123456")).toBe(true);
  });

  it("Crockford base32 に無い文字（i/l/o/u）を含む32文字は形式エラー", () => {
    expect(isInvalidConvexIdInput("iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii")).toBe(true);
    expect(isInvalidConvexIdInput("0a1b2c3d4e5f6g7h8j9kmnpqrstvwii")).toBe(true);
    expect(isInvalidConvexIdInput("0a1b2c3d4e5f6g7h8j9kmnpqrstvwuu")).toBe(true);
  });

  it("大文字は形式エラー（ConvexのIDは小文字のみ）", () => {
    expect(isInvalidConvexIdInput("0A1B2C3D4E5F6G7H8J9KMNPQRSTVW")).toBe(true);
  });
});
