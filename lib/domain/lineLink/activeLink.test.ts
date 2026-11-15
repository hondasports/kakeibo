import { describe, expect, it } from "vitest";
import { resolveActiveLink } from "./activeLink";
import type { LineAccountLinkRecord } from "./records";

const link: LineAccountLinkRecord = {
  id: "link-a",
  userId: "user-a",
  lineUserId: "line-a",
  status: "active",
  linkedAt: 100,
  createdAt: 100,
  updatedAt: 100,
};

describe("resolveActiveLink", () => {
  it.each([
    [[], { kind: "none" }],
    [[link], { kind: "single", link }],
    [[link, { ...link, id: "link-b" }], { kind: "multiple" }],
  ])("有効連携の件数を区別する", (links, expected) => {
    expect(resolveActiveLink(links as LineAccountLinkRecord[])).toEqual(expected);
  });
});
