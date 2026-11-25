import { expect, it } from "vitest";
import { recurringFrequencyValidator } from "./validators";

it("定期定義のfrequencyは weekly/monthly の順序を維持する", () => {
  const members = (recurringFrequencyValidator as { members: Array<{ value: unknown }> }).members;
  expect(members.map((member) => member.value)).toEqual(["weekly", "monthly"]);
});
