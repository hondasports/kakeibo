import { describe, expect, test } from "vitest";
import {
  filterUnpublishedPullRequests,
  getProductUpdateSourcePullRequestNumbers,
  sanitizeExternalText,
} from "./generateProductUpdates";

describe("getProductUpdateSourcePullRequestNumbers", () => {
  test.each([
    ["pr-724", [724]],
    ["prs-724-726", [724, 726]],
    ["manual-001", []],
    ["pr-", []],
    ["prs-", []],
  ])("%s → %j", (id, expected) => {
    expect(getProductUpdateSourcePullRequestNumbers(id)).toEqual(expected);
  });
});

describe("filterUnpublishedPullRequests", () => {
  const pulls = [{ number: 724 }, { number: 725 }, { number: 726 }, { number: 727 }];

  test("excludes PRs already published by pr-N id", () => {
    expect(
      filterUnpublishedPullRequests(pulls, [{ id: "pr-724" }]).map((pull) => pull.number),
    ).toEqual([725, 726, 727]);
  });

  test("excludes PRs already published by prs- grouped id", () => {
    expect(
      filterUnpublishedPullRequests(pulls, [{ id: "prs-724-726" }]).map((pull) => pull.number),
    ).toEqual([725, 727]);
  });

  test("ignores non-PR ids", () => {
    expect(
      filterUnpublishedPullRequests(pulls, [{ id: "manual-001" }]).map((pull) => pull.number),
    ).toEqual([724, 725, 726, 727]);
  });
});

describe("sanitizeExternalText", () => {
  test("removes invisible characters", () => {
    const text = "title​ with ‎hidden‏ chars﻿";
    expect(sanitizeExternalText(text)).toBe("title with hidden chars");
  });

  test("normalizes unicode", () => {
    const text = `á`; // a + combining acute
    expect(sanitizeExternalText(text)).toBe("á");
  });

  test("removes html comments", () => {
    const text = `before <!-- hidden --> after`;
    expect(sanitizeExternalText(text)).toBe("before  after");
  });
});
