import { describe, expect, it } from "vitest";
import { categoryMoveDirectionValidator } from "../lib/convex/categories/validators";
import { recurringFrequencyValidator } from "../lib/convex/recurringRules/validators";
import { entryKindValidator } from "../lib/convex/receipts/validators";
import { savedExpenseSearchKindValidator } from "../lib/convex/savedExpenseSearches/validators";
import { systemAdminAuditGroupRelationValidator } from "../lib/convex/systemAdmin/validators";
import { groupDeletionPreviewAccuracyValidator } from "./groups/validators";

type ValidatorShape = {
  kind: string;
  value?: unknown;
  members?: ValidatorShape[];
  fields?: Record<string, ValidatorShape>;
};

function literalValues(validator: ValidatorShape): unknown[] {
  expect(validator.kind).toBe("union");
  return (validator.members ?? []).map((member) => {
    expect(member.kind).toBe("literal");
    return member.value;
  });
}

describe("domain配列から作るvalidator", () => {
  it("収支種別は expense/income の順序を維持する", () => {
    expect(literalValues(entryKindValidator as ValidatorShape)).toEqual(["expense", "income"]);
  });

  it("定期定義のfrequencyは weekly/monthly の順序を維持する", () => {
    expect(literalValues(recurringFrequencyValidator as ValidatorShape)).toEqual([
      "weekly",
      "monthly",
    ]);
  });

  it("保存検索のkindは saved/recent の順序を維持する", () => {
    expect(literalValues(savedExpenseSearchKindValidator as ValidatorShape)).toEqual([
      "saved",
      "recent",
    ]);
  });

  it("システム管理監査のgroupRelationは source/target/direct の順序を維持する", () => {
    expect(literalValues(systemAdminAuditGroupRelationValidator as ValidatorShape)).toEqual([
      "source",
      "target",
      "direct",
    ]);
  });

  it("カテゴリ移動のdirectionは up/down の順序を維持する", () => {
    expect(literalValues(categoryMoveDirectionValidator as ValidatorShape)).toEqual(["up", "down"]);
  });

  it("グループ削除プレビューのaccuracyは exact/at_least/unknown の順序を維持する", () => {
    expect(literalValues(groupDeletionPreviewAccuracyValidator as ValidatorShape)).toEqual([
      "exact",
      "at_least",
      "unknown",
    ]);
  });
});
