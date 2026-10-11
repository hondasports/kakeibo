import { describe, expect, it, vi } from "vitest";
import type { GroupLifecycleStatus } from "../../domain/groups/lifecycle";
import { removeMember } from "./removeMember";

const OWNER = "owner";
const TARGET = "target";

type Fixture = {
  targetActiveGroupId: string | undefined;
  targetGroups: { id: string; status?: GroupLifecycleStatus }[];
};

function setup({ targetActiveGroupId, targetGroups }: Fixture) {
  const setActiveGroup = vi.fn().mockResolvedValue(undefined);
  const groupRecord = (id: string, status?: GroupLifecycleStatus) => ({
    id,
    name: id,
    status,
    createdAt: 1,
    updatedAt: 1,
  });
  const deps = {
    groups: {
      get: vi.fn(async (id: string) => {
        if (id === "A") return groupRecord("A");
        const found = targetGroups.find((g) => g.id === id);
        return found ? groupRecord(found.id, found.status) : null;
      }),
    },
    memberships: {
      findByGroupAndUser: vi.fn(async () => ({
        id: "m-target-A",
        groupId: "A",
        userId: TARGET,
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      })),
      delete: vi.fn().mockResolvedValue(undefined),
      // 除外済みの A は含めず、残りの所属だけを返す（実装の listByUser と同じ振る舞い）
      listByUser: vi.fn(async () =>
        targetGroups.map((g) => ({
          id: `m-${g.id}`,
          groupId: g.id,
          userId: TARGET,
          role: "member",
          createdAt: 1,
          updatedAt: 1,
        })),
      ),
    },
    users: {
      findByUserId: vi.fn(async () => ({
        docId: "user-target",
        userId: TARGET,
        displayName: "対象",
        activeGroupId: targetActiveGroupId,
      })),
      setActiveGroup,
    },
    invitationCleanup: { revokeForEmail: vi.fn().mockResolvedValue(undefined) },
    auditLog: { record: vi.fn().mockResolvedValue(undefined) },
    emailQueue: { membershipRemoved: vi.fn().mockResolvedValue(undefined) },
  };
  return { deps, setActiveGroup };
}

async function run(fixture: Fixture) {
  const { deps, setActiveGroup } = setup(fixture);
  await removeMember(
    { groupId: "A", userId: OWNER },
    deps as unknown as Parameters<typeof removeMember>[1],
    { targetUserId: TARGET },
  );
  return { setActiveGroup };
}

describe("removeMember の activeGroupId 付け替え", () => {
  it("対象の active が別グループ C なら変更しない", async () => {
    const { setActiveGroup } = await run({
      targetActiveGroupId: "C",
      targetGroups: [{ id: "B" }, { id: "C" }],
    });
    expect(setActiveGroup).not.toHaveBeenCalled();
  });

  it("対象の active が除外元グループなら生存中の残りグループへ移す", async () => {
    const { setActiveGroup } = await run({
      targetActiveGroupId: "A",
      targetGroups: [{ id: "B", status: "deleting" }, { id: "C", status: "deleted" }, { id: "D" }],
    });
    expect(setActiveGroup).toHaveBeenCalledWith("user-target", "D", expect.any(Number));
  });

  it("生存中の残りグループがなければ解除する", async () => {
    const { setActiveGroup } = await run({
      targetActiveGroupId: "A",
      targetGroups: [{ id: "B", status: "deleting" }],
    });
    expect(setActiveGroup).toHaveBeenCalledWith("user-target", undefined, expect.any(Number));
  });

  it("所属が残らなければ解除する", async () => {
    const { setActiveGroup } = await run({ targetActiveGroupId: "A", targetGroups: [] });
    expect(setActiveGroup).toHaveBeenCalledWith("user-target", undefined, expect.any(Number));
  });
});
