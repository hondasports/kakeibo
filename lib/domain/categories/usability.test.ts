import { describe, expect, it } from "vitest";
import { checkCategoryUsabilityForEntry } from "./usability";

describe("エントリのカテゴリ利用可否", () => {
  it.each([
    [null, undefined, { usable: false, error: "not_found" }],
    [
      { id: "c", groupId: "other", isActive: true },
      undefined,
      { usable: false, error: "wrong_group" },
    ],
    [{ id: "c", groupId: "g", isActive: true }, undefined, { usable: true }],
    [{ id: "c", groupId: "g", isActive: false }, undefined, { usable: false, error: "inactive" }],
    [{ id: "c", groupId: "g", isActive: false }, "c", { usable: true }],
    [{ id: "c", groupId: "other", isActive: false }, "c", { usable: false, error: "wrong_group" }],
    [{ id: "c", groupId: "g", isActive: false }, "other", { usable: false, error: "inactive" }],
  ])("存在・所属・有効状態と現在値を判定する", (category, current, expected) => {
    expect(
      checkCategoryUsabilityForEntry(category, "g", { allowInactiveWhenUnchangedFrom: current }),
    ).toEqual(expected);
  });
});
