import { describe, expect, it } from "vitest";
import {
  assertRetrieved,
  assertWeekSessionFound,
  buildCompletePatch,
  buildNewWeekSessionFields,
  buildResetPatch,
  formatLocalDate,
  WeekSessionDomainError,
} from "./rules";

describe("formatLocalDate", () => {
  it("ローカル時刻で YYYY-MM-DD にゼロ埋めする", () => {
    const ts = new Date(2024, 0, 5, 12).getTime();
    expect(formatLocalDate(ts)).toBe("2024-01-05");
  });
});

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

describe("buildCompletePatch", () => {
  it("reviewMemo 未指定ならキーを含めない", () => {
    const patch = buildCompletePatch(undefined, 5);
    expect(patch).toEqual({ status: "completed", updatedAt: 5 });
    expect("reviewMemo" in patch).toBe(false);
  });
  it("reviewMemo 指定時はキーを含める（空文字も含む）", () => {
    expect(buildCompletePatch("", 5)).toEqual({
      status: "completed",
      updatedAt: 5,
      reviewMemo: "",
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
  it("assertWeekSessionFound は null で Week session not found を投げる", () => {
    expect(() => assertWeekSessionFound(null)).toThrow(WeekSessionDomainError);
    expect(() => assertWeekSessionFound(null)).toThrow("Week session not found");
  });
  it("assertRetrieved は kind に応じた文言を投げる", () => {
    expect(() => assertRetrieved(null, "created")).toThrow(
      "Failed to retrieve created week session",
    );
    expect(() => assertRetrieved(null, "updated")).toThrow(
      "Failed to retrieve updated week session",
    );
  });
});
