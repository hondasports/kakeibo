import { describe, expect, it, vi } from "vitest";
import type { LineAccountLinkRecord } from "../../domain/lineLink/records";
import { getLineLinkStatus } from "./statusAndUnlink";

const link: LineAccountLinkRecord = {
  id: "link-a",
  userId: "user-a",
  lineUserId: "line-a",
  status: "active",
  linkedAt: 100,
  createdAt: 100,
  updatedAt: 100,
};

describe("getLineLinkStatus", () => {
  it.each([
    [[], { status: "unlinked" }],
    [[link], { status: "linked", linkedAt: 100 }],
    [[link, { ...link, id: "link-b" }], { status: "unlinked" }],
  ])("有効連携の件数に応じた状態を返す", async (links, expected) => {
    const accountLinks = {
      listActiveByUserId: vi.fn().mockResolvedValue(links),
      listActiveByLineUserId: vi.fn(),
    };
    expect(await getLineLinkStatus(accountLinks, "user-a")).toEqual(expected);
  });
});
