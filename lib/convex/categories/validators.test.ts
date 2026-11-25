import { expect, it } from "vitest";
import { categoryMoveDirectionValidator } from "./validators";

it("カテゴリ移動のdirectionは up/down の順序を維持する", () => {
  const members = (categoryMoveDirectionValidator as { members: Array<{ value: unknown }> })
    .members;
  expect(members.map((member) => member.value)).toEqual(["up", "down"]);
});
