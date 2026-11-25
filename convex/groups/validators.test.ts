import { expect, it } from "vitest";
import { groupDeletionPreviewAccuracyValidator } from "./validators";

it("グループ削除プレビューのaccuracyは exact/at_least/unknown の順序を維持する", () => {
  const members = (groupDeletionPreviewAccuracyValidator as { members: Array<{ value: unknown }> })
    .members;
  expect(members.map((member) => member.value)).toEqual(["exact", "at_least", "unknown"]);
});
