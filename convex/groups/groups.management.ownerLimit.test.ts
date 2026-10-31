import type { Id } from "../_generated/dataModel";
import { changeMemberRoleHandler, transferGroupOwnershipHandler } from "./members";
import { describe, expect, it, vi } from "vitest";
import { createIdentity, createMockDb } from "./testHelpers";
import { MAX_OWNED_GROUPS_PER_USER } from "../../lib/domain/groups/groupInvitation";
import type { GroupRole } from "../../lib/domain/groups/role";

const ownerId = "https://issuer.example|owner";
const targetUserId = "https://issuer.example|target";

/** group-001 の owner(actor) と member(target)。target は他グループの owner を otherOwnedCount 個持つ。 */
function createCtx(
  otherOwnedCount: number,
  targetRoleInGroup: GroupRole = "member",
  otherMemberCount = 0,
) {
  const ctx = createMockDb({
    users: [
      {
        _id: "user-owner" as Id<"users">,
        userId: ownerId,
        displayName: "オーナー",
        activeGroupId: "group-001" as Id<"groups">,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "user-target" as Id<"users">,
        userId: targetUserId,
        displayName: "対象",
        email: "target@example.com",
        activeGroupId: "group-001" as Id<"groups">,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    groupMembers: [
      {
        _id: "member-owner" as Id<"groupMembers">,
        groupId: "group-001" as Id<"groups">,
        userId: ownerId,
        role: "owner",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        _id: "member-target" as Id<"groupMembers">,
        groupId: "group-001" as Id<"groups">,
        userId: targetUserId,
        role: targetRoleInGroup,
        createdAt: 1000,
        updatedAt: 1000,
      },
      // member 行を owner 行より先に並べ、先頭 100 件が member でも数え漏らさないことを確認する。
      ...Array.from({ length: otherMemberCount }, (_, index) => ({
        _id: `target-joined-${index}` as Id<"groupMembers">,
        groupId: `group-joined-${index}` as Id<"groups">,
        userId: targetUserId,
        role: "member" as const,
        createdAt: 1000,
        updatedAt: 1000,
      })),
      ...Array.from({ length: otherOwnedCount }, (_, index) => ({
        _id: `target-owned-${index}` as Id<"groupMembers">,
        groupId: `group-other-${index}` as Id<"groups">,
        userId: targetUserId,
        role: "owner" as const,
        createdAt: 1000,
        updatedAt: 1000,
      })),
    ],
  });
  ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));
  return ctx;
}

const LIMIT_MESSAGE = "対象ユーザーが保持できるグループの上限";

describe("groups (management) (オーナー付与時の保持上限)", () => {
  it("changeMemberRole: 他グループの owner が上限未満の対象は昇格できる", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER - 1);
    await expect(
      changeMemberRoleHandler(ctx, { targetUserId, newRole: "owner" }),
    ).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-target",
      expect.objectContaining({ role: "owner" }),
    );
  });

  it("changeMemberRole: 上限に達した対象の昇格は拒否し、更新・監査ログ・メールを残さない", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER);
    await expect(changeMemberRoleHandler(ctx, { targetUserId, newRole: "owner" })).rejects.toThrow(
      LIMIT_MESSAGE,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("changeMemberRole: 上限に達していても member への降格は影響を受けない", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER, "owner");
    await expect(
      changeMemberRoleHandler(ctx, { targetUserId, newRole: "member" }),
    ).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-target",
      expect.objectContaining({ role: "member" }),
    );
  });

  it("transferGroupOwnership: 他グループの owner が上限未満の譲渡先へは譲渡できる", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER - 1);
    await expect(transferGroupOwnershipHandler(ctx, { targetUserId })).resolves.toBeUndefined();
    expect(ctx.db.patch).toHaveBeenCalledWith(
      "member-target",
      expect.objectContaining({ role: "owner" }),
    );
  });

  it("transferGroupOwnership: 上限に達した譲渡先への譲渡は拒否し、更新・監査ログ・メールを残さない", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER);
    await expect(transferGroupOwnershipHandler(ctx, { targetUserId })).rejects.toThrow(
      LIMIT_MESSAGE,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("changeMemberRole: 先に 120 件の member 行があっても、owner が上限なら昇格を拒否する", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER, "member", 120);
    await expect(changeMemberRoleHandler(ctx, { targetUserId, newRole: "owner" })).rejects.toThrow(
      LIMIT_MESSAGE,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("changeMemberRole: 先に 120 件の member 行があっても、owner が上限未満なら昇格できる", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER - 1, "member", 120);
    await expect(
      changeMemberRoleHandler(ctx, { targetUserId, newRole: "owner" }),
    ).resolves.toBeUndefined();
  });

  it("transferGroupOwnership: 先に 120 件の member 行があっても、owner が上限なら譲渡を拒否する", async () => {
    const ctx = createCtx(MAX_OWNED_GROUPS_PER_USER, "member", 120);
    await expect(transferGroupOwnershipHandler(ctx, { targetUserId })).rejects.toThrow(
      LIMIT_MESSAGE,
    );
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
