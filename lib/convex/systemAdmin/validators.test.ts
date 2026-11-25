import { expect, it } from "vitest";
import { systemAdminAuditGroupRelationValidator } from "./validators";

it("システム管理監査のgroupRelationは source/target/direct の順序を維持する", () => {
  const members = (systemAdminAuditGroupRelationValidator as { members: Array<{ value: unknown }> })
    .members;
  expect(members.map((member) => member.value)).toEqual(["source", "target", "direct"]);
});
