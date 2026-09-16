import { describe, expect, it } from "vitest";
import {
  assertUserFound,
  buildUserInsertFields,
  buildUserUpsertPatch,
  resolveProfileDisplayName,
} from "./rules";

describe("buildUserInsertFields", () => {
  it("identity から insert フィールドを構築する", () => {
    const fields = buildUserInsertFields(
      { userId: "u1", name: "  田中  ", email: "TARO@Example.com" },
      1000,
    );
    expect(fields).toEqual({
      userId: "u1",
      displayName: "田中",
      email: "taro@example.com",
      createdAt: 1000,
      updatedAt: 1000,
    });
  });

  it("name 未設定時は email から displayName を解決する", () => {
    const fields = buildUserInsertFields({ userId: "u1", email: "a@b.com" }, 0);
    expect(fields.displayName).toBe("a@b.com");
  });
});

describe("buildUserUpsertPatch", () => {
  it("既存 displayName をフォールバックに使い email は既存値を維持する", () => {
    const patch = buildUserUpsertPatch(
      { userId: "u1" },
      { displayName: "既存名", email: "keep@x.com" },
      500,
    );
    expect(patch).toEqual({
      displayName: "既存名",
      email: "keep@x.com",
      updatedAt: 500,
    });
  });

  it("identity の name/email があれば上書きする", () => {
    const patch = buildUserUpsertPatch(
      { userId: "u1", name: "新名", email: "New@x.com" },
      { displayName: "既存名", email: "old@x.com" },
      500,
    );
    expect(patch).toEqual({
      displayName: "新名",
      email: "new@x.com",
      updatedAt: 500,
    });
  });
});

describe("resolveProfileDisplayName", () => {
  it("displayName の trim 値を優先する", () => {
    expect(resolveProfileDisplayName("  名前  ", "e@x.com")).toBe("名前");
  });
  it("displayName が空なら email にフォールバックする", () => {
    expect(resolveProfileDisplayName("   ", "e@x.com")).toBe("e@x.com");
  });
  it("両方空なら「ユーザー」になる", () => {
    expect(resolveProfileDisplayName(" ", undefined)).toBe("ユーザー");
    expect(resolveProfileDisplayName("", "")).toBe("ユーザー");
  });
});

describe("assertUserFound", () => {
  it("null 以外はそのまま返す", () => {
    const user = { id: "1" };
    expect(assertUserFound(user)).toBe(user);
  });
  it("null なら User not found を投げる", () => {
    expect(() => assertUserFound(null)).toThrow("User not found");
  });
});
