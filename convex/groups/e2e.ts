import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { deleteAllGroupScopedData } from "./lib/deleteGroupPhysically";
import { normalizeEmail } from "./lib/groupEmailMatching";
import { readQueryDoc, readQueryDocs } from "./lib/groupQueryHelpers";
import { isGroupDeleted } from "../../lib/domain/groups/lifecycle";
import type { GroupRole } from "../../lib/domain/groups/role";
import { groupRoleValidator } from "./validators";

async function deleteMembershipPreservingOwnerInvariant(
  ctx: MutationCtx,
  membership: Doc<"groupMembers">,
) {
  if (membership.role === "owner") {
    const groupMembers = await readQueryDocs(
      ctx.db
        .query("groupMembers")
        .withIndex("by_group_id", (q) => q.eq("groupId", membership.groupId)),
    );
    const remainingMembers = groupMembers.filter((member) => member._id !== membership._id);
    const hasRemainingOwner = remainingMembers.some((member) => member.role === "owner");
    const successor = hasRemainingOwner ? undefined : remainingMembers[0];
    if (successor) {
      await ctx.db.patch(successor._id, { role: "owner", updatedAt: Date.now() });
    }
  }

  await ctx.db.delete(membership._id);
}

async function deleteE2eSeededUserByEmailIfExists(
  ctx: MutationCtx,
  email: string,
  groupId: Id<"groups">,
) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await readQueryDoc(
    ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", normalizedEmail)),
  );
  if (existingUser === null || !existingUser.userId.startsWith("e2e-seed|")) {
    return;
  }

  const memberships = await readQueryDocs(
    ctx.db
      .query("groupMembers")
      .withIndex("by_user_id", (q) => q.eq("userId", existingUser.userId)),
  );
  if (memberships.some((membership) => membership.groupId !== groupId)) {
    throw new ConvexError("別のグループに所属する E2E ユーザーは置き換えできません");
  }
  for (const membership of memberships) {
    await deleteMembershipPreservingOwnerInvariant(ctx, membership);
  }
  await ctx.db.delete(existingUser._id);
}

export async function deleteGroupMembershipsByUserHandler(
  ctx: MutationCtx,
  args: { userId: string; groupId: Id<"groups"> | null },
) {
  const { userId, groupId } = args;
  const membershipQuery = ctx.db
    .query("groupMembers")
    .withIndex("by_user_id", (q) => q.eq("userId", userId));
  const memberships = await readQueryDocs(membershipQuery);
  const targetMemberships = memberships.filter((membership) => membership.groupId === groupId);
  const remainingMemberships = memberships.filter((membership) => membership.groupId !== groupId);

  for (const membership of targetMemberships) {
    await deleteMembershipPreservingOwnerInvariant(ctx, membership);
  }

  const user = await readQueryDoc(
    ctx.db.query("users").withIndex("by_token_identifier", (q) => q.eq("userId", userId)),
  );
  if (user !== null) {
    if (userId.startsWith("e2e-seed|") && remainingMemberships.length === 0) {
      await ctx.db.delete(user._id);
    } else if (user.activeGroupId === groupId) {
      let nextActiveGroupId: Id<"groups"> | undefined;
      for (const membership of remainingMemberships) {
        const candidate = await ctx.db.get(membership.groupId);
        if (candidate !== null && !isGroupDeleted(candidate)) {
          nextActiveGroupId = membership.groupId;
          break;
        }
      }
      await ctx.db.patch(user._id, {
        activeGroupId: nextActiveGroupId,
        updatedAt: Date.now(),
      });
    }
  }

  return { deletedCount: targetMemberships.length };
}

export async function setGroupMemberRoleForE2eHandler(
  ctx: MutationCtx,
  args: { userId: string; groupId: Id<"groups"> | null; role: GroupRole },
) {
  const { userId, groupId, role } = args;
  if (groupId === null) {
    return { updated: false };
  }
  const membership = await readQueryDoc(
    ctx.db
      .query("groupMembers")
      .withIndex("by_group_id_and_user_id", (q) => q.eq("groupId", groupId).eq("userId", userId)),
  );
  if (membership === null) {
    return { updated: false };
  }

  await ctx.db.patch(membership._id, {
    role,
    updatedAt: Date.now(),
  });

  return { updated: true };
}

export async function seedPendingGroupInvitationForE2eHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; email: string; invitedByUserId: string },
) {
  const now = Date.now();
  const token = `e2e-pending-${now}`;
  const invitationId = await ctx.db.insert("groupInvitations", {
    groupId: args.groupId,
    email: normalizeEmail(args.email),
    token,
    status: "pending",
    invitedByUserId: args.invitedByUserId,
    createdAt: now,
    updatedAt: now,
  });
  return { invitationId, token };
}

export async function seedGroupMemberForE2eHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; displayName: string; email: string },
) {
  await deleteE2eSeededUserByEmailIfExists(ctx, args.email, args.groupId);

  const now = Date.now();
  const memberUserId = `e2e-seed|group-member-${now}`;
  await ctx.db.insert("users", {
    userId: memberUserId,
    displayName: args.displayName,
    email: normalizeEmail(args.email),
    activeGroupId: args.groupId,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("groupMembers", {
    groupId: args.groupId,
    userId: memberUserId,
    role: "member",
    createdAt: now,
    updatedAt: now,
  });
  return { memberUserId };
}

export async function clearGroupInvitationsForE2eHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups"> },
) {
  const { groupId } = args;
  const statuses = ["pending", "revoked", "expired", "accepted"] as const;
  let deletedCount = 0;

  for (const status of statuses) {
    const invitations = await readQueryDocs(
      ctx.db
        .query("groupInvitations")
        .withIndex("by_group_id_and_status", (q) => q.eq("groupId", groupId).eq("status", status)),
    );

    for (const invitation of invitations) {
      await ctx.db.delete(invitation._id);
      deletedCount += 1;
    }
  }

  return { deletedCount };
}

export async function getGroupIdByUserIdHandler(ctx: QueryCtx, args: { userId: string }) {
  const { userId } = args;
  const user = await readQueryDoc(
    ctx.db.query("users").withIndex("by_token_identifier", (q) => q.eq("userId", userId)),
  );
  const membershipQuery = ctx.db
    .query("groupMembers")
    .withIndex("by_user_id", (q) => q.eq("userId", userId));
  const memberships = await readQueryDocs(membershipQuery);

  if (memberships.length === 0) return null;
  if (user?.activeGroupId) {
    const active = memberships.find((membership) => membership.groupId === user.activeGroupId);
    if (active) return active.groupId;
  }
  return memberships[0]?.groupId ?? null;
}

export async function setGroupClerkOrganizationIdHandler(
  ctx: MutationCtx,
  args: { groupId: Id<"groups">; clerkOrganizationId: string },
) {
  const { groupId, clerkOrganizationId } = args;
  const group = await ctx.db.get(groupId);
  if (group === null) {
    throw new ConvexError("Group not found");
  }

  await ctx.db.patch(groupId, {
    clerkOrganizationId,
    updatedAt: Date.now(),
  });
}

export async function deleteGroupForE2eHandler(ctx: MutationCtx, args: { groupId: Id<"groups"> }) {
  await deleteAllGroupScopedData(ctx, args.groupId);
}

export const deleteGroupMembershipsByUser = internalMutation({
  args: { userId: v.string(), groupId: v.union(v.id("groups"), v.null()) },
  returns: v.object({ deletedCount: v.number() }),
  handler: deleteGroupMembershipsByUserHandler,
});

export const setGroupMemberRoleForE2e = internalMutation({
  args: {
    userId: v.string(),
    groupId: v.union(v.id("groups"), v.null()),
    role: groupRoleValidator,
  },
  returns: v.object({ updated: v.boolean() }),
  handler: setGroupMemberRoleForE2eHandler,
});

export const seedPendingGroupInvitationForE2e = internalMutation({
  args: {
    groupId: v.id("groups"),
    email: v.string(),
    invitedByUserId: v.string(),
  },
  returns: v.object({ invitationId: v.id("groupInvitations"), token: v.string() }),
  handler: seedPendingGroupInvitationForE2eHandler,
});

export const seedGroupMemberForE2e = internalMutation({
  args: {
    groupId: v.id("groups"),
    displayName: v.string(),
    email: v.string(),
  },
  returns: v.object({
    memberUserId: v.string(),
  }),
  handler: seedGroupMemberForE2eHandler,
});

export const clearGroupInvitationsForE2e = internalMutation({
  args: { groupId: v.id("groups") },
  returns: v.object({ deletedCount: v.number() }),
  handler: clearGroupInvitationsForE2eHandler,
});

export const getGroupIdByUserId = internalQuery({
  args: { userId: v.string() },
  handler: getGroupIdByUserIdHandler,
});

export const normalizeGroupId = internalQuery({
  args: { groupId: v.string() },
  returns: v.union(v.id("groups"), v.null()),
  handler: async (ctx, args) => ctx.db.normalizeId("groups", args.groupId),
});

export const deleteGroupForE2e = internalMutation({
  args: { groupId: v.id("groups") },
  handler: deleteGroupForE2eHandler,
});
