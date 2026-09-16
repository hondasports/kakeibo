/**
 * GroupInvitationRepository の Convex 実装。
 * クエリ読み出しは既存の groupQueryHelpers 経由（テストモック互換のため）。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { GroupInvitationRecord } from "../../domain/groups/groupInvitation";
import type {
  GroupInvitationReadRepository,
  GroupInvitationRepository,
} from "../../domain/groups/groupInvitationRepository";
import { readQueryDoc, readQueryDocs } from "../../../convex/groups/lib/groupQueryHelpers";

function invitationDocToFields(doc: Doc<"groupInvitations">): GroupInvitationRecord {
  return {
    id: doc._id,
    groupId: doc.groupId,
    email: doc.email,
    token: doc.token,
    status: doc.status,
    invitedByUserId: doc.invitedByUserId,
    clerkInvitationId: doc.clerkInvitationId,
    acceptedByUserId: doc.acceptedByUserId,
    acceptedAt: doc.acceptedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function createInvitationRead(ctx: Pick<QueryCtx, "db">): GroupInvitationReadRepository {
  return {
    async findByToken(token) {
      const doc = await readQueryDoc(
        ctx.db.query("groupInvitations").withIndex("by_token", (q) => q.eq("token", token)),
      );
      return doc === null ? null : invitationDocToFields(doc);
    },
    async findById(invitationId) {
      const doc = await ctx.db.get(invitationId as Id<"groupInvitations">);
      return doc === null ? null : invitationDocToFields(doc);
    },
    async listByGroupAndStatus(groupId, status) {
      const docs = await readQueryDocs(
        ctx.db
          .query("groupInvitations")
          .withIndex("by_group_id_and_status", (q) =>
            q.eq("groupId", groupId as Id<"groups">).eq("status", status),
          ),
      );
      return docs.map(invitationDocToFields);
    },
    async listByGroupAndEmail(groupId, email) {
      const docs = await readQueryDocs(
        ctx.db
          .query("groupInvitations")
          .withIndex("by_group_id_and_email", (q) =>
            q.eq("groupId", groupId as Id<"groups">).eq("email", email),
          ),
      );
      return docs.map(invitationDocToFields);
    },
  };
}

export function createGroupInvitationRepository(
  ctx: Pick<MutationCtx, "db">,
): GroupInvitationRepository {
  return {
    ...createInvitationRead(ctx),
    async insert(fields) {
      return await ctx.db.insert(
        "groupInvitations",
        fields as Omit<Doc<"groupInvitations">, "_id" | "_creationTime">,
      );
    },
    async patch(invitationId, fields) {
      await ctx.db.patch(
        invitationId as Id<"groupInvitations">,
        fields as Partial<Doc<"groupInvitations">>,
      );
    },
    async delete(invitationId) {
      await ctx.db.delete(invitationId as Id<"groupInvitations">);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createGroupInvitationReadRepository(
  ctx: Pick<QueryCtx, "db">,
): GroupInvitationReadRepository {
  return createInvitationRead(ctx);
}
