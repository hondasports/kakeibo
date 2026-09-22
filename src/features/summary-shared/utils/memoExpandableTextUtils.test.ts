import { describe, expect, it } from "vitest";
import {
  countExplicitMemoLines,
  memoNeedsCollapseByLayout,
  memoNeedsCollapseByLineCount,
} from "./memoExpandableTextUtils";

describe("memoExpandableTextUtils", () => {
  it("改行2行以下は行数だけでは折りたたみ不要", () => {
    expect(countExplicitMemoLines("夕食の買い物")).toBe(1);
    expect(memoNeedsCollapseByLineCount("あ\nい")).toBe(false);
  });

  it("改行3行以上は折りたたみ対象", () => {
    expect(memoNeedsCollapseByLineCount("あ\nい\nう")).toBe(true);
    expect(memoNeedsCollapseByLineCount("あ\nい\nう\nえ\nお")).toBe(true);
  });

  it("折り返しで3行以上になる高さなら折りたたみ対象", () => {
    expect(memoNeedsCollapseByLayout(60, 20)).toBe(true);
    expect(memoNeedsCollapseByLayout(41, 20)).toBe(true);
    expect(memoNeedsCollapseByLayout(40, 20)).toBe(false);
  });
});
