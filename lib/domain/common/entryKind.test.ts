import { describe, expect, it } from "vitest";
import { ENTRY_KIND_LABELS } from "./entryKind";

describe("ENTRY_KIND_LABELS", () => {
  it("収支種別の表示ラベルを固定する", () => {
    expect(ENTRY_KIND_LABELS).toEqual({
      expense: "支出",
      income: "収入",
    });
  });
});
