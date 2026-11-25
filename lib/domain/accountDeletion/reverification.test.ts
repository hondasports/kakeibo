import { describe, expect, it } from "vitest";
import { evaluateStrictReverification } from "./reverification";

describe("evaluateStrictReverification", () => {
  it.each([
    [[0, -1], "第一要素のみ・直後"],
    [[9, -1], "第一要素のみ・9分"],
    [[0, 0], "第二要素・直後"],
    [[0, 9], "第二要素・9分"],
    [[-1, 9], "第一要素なし・第二要素9分"],
  ])("%s は strict（%s）を満たす", (fva) => {
    expect(evaluateStrictReverification(fva)).toBe("satisfied");
  });

  it.each([
    [[10, -1], "第一要素のみ・10分ちょうど"],
    [[11, -1], "第一要素のみ・11分"],
    [[0, 10], "第二要素・10分ちょうど"],
    [[0, 11], "第二要素・11分"],
    [[-1, 10], "第一要素なし・第二要素10分ちょうど"],
    [[-1, -1], "第一・第二要素ともなし"],
  ])("%s は再認証が必要（%s）", (fva) => {
    expect(evaluateStrictReverification(fva)).toBe("reverification_required");
  });

  it.each([
    [undefined, "fvaなし"],
    [null, "fva null"],
    [[], "空配列"],
    [[9], "要素不足"],
    [["9", -1], "数値でない"],
    [[Number.NaN, -1], "NaN"],
    [[Number.POSITIVE_INFINITY, -1], "Infinity"],
    [[-2, -1], "第一要素が-1以外の負数"],
    [[-1, -2], "第二要素が-1以外の負数"],
  ])("%s は形式不正として拒否（%s）", (fva) => {
    expect(evaluateStrictReverification(fva)).toBe("invalid");
  });

  it("第二要素が登録済みなら第一要素ではなく第二要素の経過時間で判定する", () => {
    expect(evaluateStrictReverification([0, 10])).toBe("reverification_required");
    expect(evaluateStrictReverification([0, 9])).toBe("satisfied");
  });
});
