import { describe, expect, it } from "vitest";
import { assertRetrieved, buildNewWeekSessionFields, buildResetPatch } from "./rules";

describe("buildNewWeekSessionFields", () => {
  it("draft・createdAt=updatedAt=now で構築する", () => {
    expect(
      buildNewWeekSessionFields({
        groupId: "g1",
        weekStartDate: "2024-01-08",
        weekEndDate: "2024-01-14",
        now: 100,
      }),
    ).toEqual({
      groupId: "g1",
      weekStartDate: "2024-01-08",
      weekEndDate: "2024-01-14",
      status: "draft",
      createdAt: 100,
      updatedAt: 100,
    });
  });
});

describe("buildResetPatch", () => {
  it("reviewMemo を undefined で明示クリアする", () => {
    const patch = buildResetPatch(9);
    expect(patch).toEqual({ status: "draft", reviewMemo: undefined, updatedAt: 9 });
    expect("reviewMemo" in patch).toBe(true);
  });
});

describe("assert helpers", () => {
  it("assertRetrieved は kind に応じた文言を投げる", () => {
    expect(() => assertRetrieved(null, "created")).toThrow(
      "Failed to retrieve created week session",
    );
    expect(() => assertRetrieved(null, "updated")).toThrow(
      "Failed to retrieve updated week session",
    );
  });
});
