import { describe, expect, it } from "vitest";
import { evaluateStrictReverification } from "./reverification";

const NOW_IN_SECONDS = 1_800_000_000;

function evaluate(fva: unknown, iat: unknown = NOW_IN_SECONDS, nowInSeconds = NOW_IN_SECONDS) {
  return evaluateStrictReverification({ fva, iat, nowInSeconds });
}

describe("evaluateStrictReverification", () => {
  it.each([
    [[9, -1], NOW_IN_SECONDS, "第一要素9分・発行直後"],
    [[8, -1], NOW_IN_SECONDS - 1, "第一要素8分・発行から1秒"],
    [[0, 8], NOW_IN_SECONDS - 1, "第二要素8分・発行から1秒"],
    [[-1, 8], NOW_IN_SECONDS - 1, "第一要素なし・第二要素8分・発行から1秒"],
    [[0, -1], NOW_IN_SECONDS - 540, "第一要素0分・発行から9分ちょうど"],
  ])("%s は strict（%s）を満たす", (fva, iat) => {
    expect(evaluate(fva, iat)).toBe("satisfied");
  });

  it.each([
    [[10, -1], NOW_IN_SECONDS, "第一要素10分ちょうど・発行直後"],
    [[9, -1], NOW_IN_SECONDS - 1, "第一要素9分・発行から1秒"],
    [[0, -1], NOW_IN_SECONDS - 541, "第一要素0分・発行から9分1秒"],
    [[0, 9], NOW_IN_SECONDS - 1, "第二要素9分・発行から1秒"],
    [[0, 10], NOW_IN_SECONDS, "第二要素10分ちょうど・発行直後"],
    [[-1, -1], NOW_IN_SECONDS, "第一・第二要素ともなし"],
  ])("%s は再認証が必要（%s）", (fva, iat) => {
    expect(evaluate(fva, iat)).toBe("reverification_required");
  });

  it("第二要素が登録済みなら第一要素ではなく第二要素に発行後経過時間を足して判定する", () => {
    expect(evaluate([0, 8], NOW_IN_SECONDS - 1)).toBe("satisfied");
    expect(evaluate([0, 9], NOW_IN_SECONDS - 1)).toBe("reverification_required");
  });

  it("発行からの経過分数は安全側に切り上げる", () => {
    expect(evaluate([0, -1], NOW_IN_SECONDS - 540)).toBe("satisfied");
    expect(evaluate([0, -1], NOW_IN_SECONDS - 541)).toBe("reverification_required");
  });

  it("iatがverifyTokenの許容範囲内の未来なら経過時間は足さず、許容を超える未来なら形式不正にする", () => {
    expect(evaluate([0, -1], NOW_IN_SECONDS + 5)).toBe("satisfied");
    expect(evaluate([0, -1], NOW_IN_SECONDS + 6)).toBe("invalid");
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
    expect(evaluate(fva)).toBe("invalid");
  });

  it.each([
    [undefined, "iatなし"],
    [null, "iat null"],
    ["1800000000", "iatが文字列"],
    [Number.NaN, "iatがNaN"],
    [Number.POSITIVE_INFINITY, "iatがInfinity"],
  ])("iat=%s は形式不正として拒否（%s）", (iat) => {
    expect(evaluateStrictReverification({ fva: [0, -1], iat, nowInSeconds: NOW_IN_SECONDS })).toBe(
      "invalid",
    );
  });

  it("現在時刻が有限数でなければ形式不正として拒否する", () => {
    expect(evaluate([0, -1], NOW_IN_SECONDS, Number.NaN)).toBe("invalid");
  });
});
