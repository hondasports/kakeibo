import { expect, it } from "vitest";
import { savedExpenseSearchKindValidator } from "./validators";

it("保存検索のkindは saved/recent の順序を維持する", () => {
  const members = (savedExpenseSearchKindValidator as { members: Array<{ value: unknown }> })
    .members;
  expect(members.map((member) => member.value)).toEqual(["saved", "recent"]);
});
