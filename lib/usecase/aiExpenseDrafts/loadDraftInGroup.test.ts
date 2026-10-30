import { describe, expect, it } from "vitest";
import { findDraftInGroup, loadDraftInGroup } from "./loadDraftInGroup";

describe("下書きのグループ境界", () => {
  it("同じグループの下書きを返す", async () => {
    const draft = { groupId: "g" };
    const reader = { findById: async () => draft };
    await expect(findDraftInGroup(reader, "g", "id")).resolves.toEqual(draft);
    await expect(loadDraftInGroup(reader, "g", "id")).resolves.toEqual(draft);
  });
  it.each([null, { groupId: "other" }])("不存在と他グループを同じ応答にする", async (draft) => {
    const reader = { findById: async () => draft };
    await expect(findDraftInGroup(reader, "g", "id")).resolves.toBeNull();
    await expect(loadDraftInGroup(reader, "g", "id")).rejects.toMatchObject({
      data: "AI expense draft not found",
    });
  });
});
