import { describe, expect, it } from "vitest";
import {
  buildRegistrationPatchFields,
  dedupeDraftIds,
  getReadyDraftRegistrationErrorMessage,
  isAlreadyRegistered,
  isAlreadyRegisteredAsReceipt,
  resolveRegisteredAt,
  validateReadyDraftForRegistration,
} from "./registration";

describe("validateReadyDraftForRegistration", () => {
  it("ready で date・amount・categoryId が揃っていれば成功", () => {
    expect(
      validateReadyDraftForRegistration({
        status: "ready",
        date: "2024-01-10",
        amountYen: 1000,
        categoryId: "cat-1",
      }),
    ).toEqual({ success: true });
  });

  it.each([
    [{ status: "needs_review" }, "not_ready"],
    [{ status: "ready" }, "missing_date"],
    [{ status: "ready", date: "2024-01-10" }, "missing_amount"],
    [{ status: "ready", date: "2024-01-10", amountYen: 0 }, "missing_amount"],
    [{ status: "ready", date: "2024-01-10", amountYen: 1000 }, "missing_category"],
  ] as const)("%o -> %s", (draft, expected) => {
    const result = validateReadyDraftForRegistration(draft as never);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(expected);
    }
  });
});

describe("dedupeDraftIds", () => {
  it("重複を除去する", () => {
    expect(dedupeDraftIds(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("isAlreadyRegistered", () => {
  it.each([
    [{ status: "registered" }, true],
    [{ status: "ready" }, false],
  ] as const)("%o -> %s", (draft, expected) => {
    expect(isAlreadyRegistered(draft as never)).toBe(expected);
  });
});

describe("isAlreadyRegisteredAsReceipt", () => {
  it.each([
    [{ status: "registered", registeredReceiptId: "r1" }, true],
    [{ status: "registered" }, false],
    [{ status: "ready", registeredReceiptId: "r1" }, false],
  ] as const)("%o -> %s", (draft, expected) => {
    expect(isAlreadyRegisteredAsReceipt(draft as never)).toBe(expected);
  });
});

describe("resolveRegisteredAt", () => {
  it.each([
    [{ derivedRegistration: { registeredAt: 500 }, registeredAt: 400 }, 500],
    [{ registeredAt: 400 }, 400],
    [{}, 999],
  ] as const)("%o -> %s", (fields, expected) => {
    expect(resolveRegisteredAt(fields as never, 999)).toBe(expected);
  });
});

describe("buildRegistrationPatchFields", () => {
  it("トップレベルの registeredAt は derivedRegistration.registeredAt と常に同じ値になる", () => {
    const fields = buildRegistrationPatchFields({
      destination: "expense_entries",
      registrationMode: "detailed",
      amountYen: 1200,
      date: "2026-08-26",
      categoryIds: ["cat-food"],
      registeredAt: 1234,
    });
    expect(fields.registeredAt).toBe(1234);
    expect(fields.registeredAt).toBe(fields.derivedRegistration.registeredAt);
    expect(fields.derivedRegistration).toMatchObject({
      source: "derived",
      destination: "expense_entries",
      amountYen: 1200,
      categoryIds: ["cat-food"],
    });
  });
});

describe("getReadyDraftRegistrationErrorMessage", () => {
  it.each([
    ["not_ready", "Only ready drafts can be registered"],
    ["missing_date", "Draft date is required to register"],
    ["missing_amount", "Draft amount is required to register"],
    ["missing_category", "Draft category is required to register"],
  ] as const)("%s -> %s", (error, expected) => {
    expect(getReadyDraftRegistrationErrorMessage(error)).toBe(expected);
  });
});
