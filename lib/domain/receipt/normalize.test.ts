import { describe, expect, it } from "vitest";
import { normalizeUpdateReceiptPatch } from "./normalize";

describe("normalizeUpdateReceiptPatch", () => {
  it("日付と店舗名を更新する", () => {
    const result = normalizeUpdateReceiptPatch({
      date: "2026-08-08",
      shopName: "  スーパー  ",
    });
    expect(result.date).toBe("2026-08-08");
    expect(result.shopName).toBe("スーパー");
  });

  it("空の shopName を拒否する", () => {
    expect(() => normalizeUpdateReceiptPatch({ shopName: "" })).toThrow(
      "shopName must be 100 characters or fewer",
    );
  });

  it("空文字 memo を undefined として返す", () => {
    const result = normalizeUpdateReceiptPatch({ memo: "" });
    expect(result.memo).toBeUndefined();
  });
});
