import { describe, expect, it } from "vitest";
import { reconcileNegativeLineWarnings } from "./negativeLineWarnings";

describe("reconcileNegativeLineWarnings", () => {
  it("負額行を不明へ戻した時は要確認warningを維持する", () => {
    expect(reconcileNegativeLineWarnings([], "unknown", -16)).toEqual([
      "negative_amount_line_type_uncertain",
    ]);
  });

  it("負額行を商品にした時は商品負額warningへ置き換える", () => {
    expect(
      reconcileNegativeLineWarnings(["negative_amount_line_type_uncertain"], "item", -16),
    ).toEqual(["negative_amount_on_product_line"]);
  });

  it.each(["discount", "promotion_adjustment"] as const)(
    "負額行を%sに確定した時だけ負額warningを解消する",
    (lineType) => {
      expect(
        reconcileNegativeLineWarnings(
          ["negative_amount_line_type_uncertain", "別の警告"],
          lineType,
          -16,
        ),
      ).toEqual(["別の警告"]);
    },
  );

  it("正額へ修正した時は負額warningを解消する", () => {
    expect(reconcileNegativeLineWarnings(["negative_amount_on_product_line"], "item", 16)).toEqual(
      [],
    );
  });
});
