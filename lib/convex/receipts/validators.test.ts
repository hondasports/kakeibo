import { expect, it } from "vitest";
import { entryKindValidator } from "./validators";

it("収支種別は expense/income の順序を維持する", () => {
  const members = (entryKindValidator as { members: Array<{ value: unknown }> }).members;
  expect(members.map((member) => member.value)).toEqual(["expense", "income"]);
});
