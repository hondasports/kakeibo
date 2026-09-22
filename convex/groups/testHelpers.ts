import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export type GroupDoc = {
  _id: Id<"groups">;
  name: string;
  clerkOrganizationId?: string;
  status?: "active" | "deleted" | "archived";
  deletedAt?: number;
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type UserDoc = {
  _id: Id<"users">;
  userId: string;
  displayName: string;
  email?: string;
  activeGroupId?: Id<"groups">;
  createdAt: number;
  updatedAt: number;
};

export type GroupMemberDoc = {
  _id: Id<"groupMembers">;
  groupId: Id<"groups">;
  userId: string;
  role: "owner" | "member";
  createdAt: number;
  updatedAt: number;
};

export type GroupInvitationDoc = {
  _id: Id<"groupInvitations">;
  groupId: Id<"groups">;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedByUserId: string;
  clerkInvitationId?: string;
  acceptedByUserId?: string;
  acceptedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export function createIdentity(userId: string, email = "owner@example.com"): UserIdentity {
  return {
    tokenIdentifier: userId,
    subject: userId,
    issuer: "https://issuer.example",
    email,
  };
}

export function createMockDb(state: {
  groups?: GroupDoc[];
  users?: UserDoc[];
  groupMembers?: GroupMemberDoc[];
  groupInvitations?: GroupInvitationDoc[];
}) {
  const groups = [...(state.groups ?? [])];
  const users = [...(state.users ?? [])];
  const groupMembers = [...(state.groupMembers ?? [])];
  const groupInvitations = [...(state.groupInvitations ?? [])];

  const groupIds = new Set<Id<"groups">>([
    ...groupMembers.map((m) => m.groupId),
    ...groupInvitations.map((i) => i.groupId),
  ]);
  for (const groupId of groupIds) {
    if (!groups.some((g) => g._id === groupId)) {
      groups.push({
        _id: groupId,
        name: "Test Group",
        createdAt: 1000,
        updatedAt: 1000,
      });
    }
  }

  const insert = vi.fn(async (tableName: string, doc: Record<string, unknown>) => {
    const id = `${tableName}-${insert.mock.calls.length}` as Id<
      | "groups"
      | "users"
      | "groupMembers"
      | "groupInvitations"
      | "managementAuditLogs"
      | "transactionalEmailJobs"
    >;
    const created = { _id: id, _creationTime: Date.now(), ...doc } as never;
    if (tableName === "groups") groups.push(created as GroupDoc);
    if (tableName === "users") users.push(created as UserDoc);
    if (tableName === "groupMembers") groupMembers.push(created as GroupMemberDoc);
    if (tableName === "groupInvitations") groupInvitations.push(created as GroupInvitationDoc);
    return id;
  });

  const patch = vi.fn(async (id: string, patchDoc: Record<string, unknown>) => {
    const allDocs = [groups, users, groupMembers, groupInvitations];
    for (const docs of allDocs) {
      const doc = docs.find((item) => item._id === id);
      if (doc) {
        Object.assign(doc, patchDoc);
        return;
      }
    }
  });

  const remove = vi.fn(async (id: string) => {
    const docs = [groups, users, groupMembers, groupInvitations];
    for (const list of docs) {
      const index = list.findIndex((item) => item._id === id);
      if (index >= 0) {
        list.splice(index, 1);
        return;
      }
    }
  });

  const get = vi.fn(async (id: string) => {
    return (
      [...groups, ...users, ...groupMembers, ...groupInvitations].find((doc) => doc._id === id) ??
      null
    );
  });

  const query = vi.fn((tableName: string) => ({
    withIndex: vi.fn((indexName: string, builder: (q: unknown) => unknown) => {
      const filters: Record<string, unknown> = {};
      const q = {
        eq: vi.fn((field: string, value: unknown) => {
          filters[field] = value;
          return q;
        }),
      };
      builder(q);

      const isSupportedIndex = () => {
        if (indexName.startsWith("by_group_id")) {
          return true;
        }
        if (tableName === "users") {
          return indexName === "by_token_identifier" || indexName === "by_email";
        }
        if (tableName === "groupMembers") {
          return (
            indexName === "by_user_id" ||
            indexName === "by_group_id" ||
            indexName === "by_group_id_and_role" ||
            indexName === "by_group_id_and_user_id"
          );
        }
        if (tableName === "groupInvitations") {
          return (
            indexName === "by_token" ||
            indexName === "by_group_id_and_email" ||
            indexName === "by_group_id_and_status"
          );
        }
        if (tableName === "accountDeletionRequests") {
          return indexName === "by_user_id";
        }
        return false;
      };

      if (!isSupportedIndex()) {
        throw new Error(`Unsupported mock index: ${tableName}.${indexName}`);
      }

      const filterDocs = () => {
        const source =
          tableName === "groups"
            ? groups
            : tableName === "users"
              ? users
              : tableName === "groupMembers"
                ? groupMembers
                : tableName === "groupInvitations"
                  ? groupInvitations
                  : tableName === "accountDeletionRequests"
                    ? []
                    : [];

        return source.filter((doc) => {
          if (indexName.startsWith("by_group_id") && "groupId" in doc) {
            if (doc.groupId !== filters.groupId) {
              return false;
            }
            if ("userId" in filters && "userId" in doc && doc.userId !== filters.userId) {
              return false;
            }
            if ("role" in filters && "role" in doc && doc.role !== filters.role) {
              return false;
            }
            if ("email" in filters && "email" in doc && doc.email !== filters.email) {
              return false;
            }
            if ("status" in filters && "status" in doc && doc.status !== filters.status) {
              return false;
            }
            return true;
          }
          if (indexName === "by_token_identifier" && "userId" in doc) {
            return doc.userId === filters.userId;
          }
          if (indexName === "by_email" && "email" in doc) {
            return doc.email === filters.email;
          }
          if (indexName === "by_user_id" && "userId" in doc) {
            return doc.userId === filters.userId;
          }
          if (indexName === "by_token" && "token" in doc) {
            return doc.token === filters.token;
          }
          return false;
        });
      };

      const docs = filterDocs();
      return {
        collect: vi.fn(async () => docs),
        unique: vi.fn(async () => {
          if (docs.length > 1) {
            throw new Error(`Mock unique() received ${docs.length} documents`);
          }
          return docs[0] ?? null;
        }),
        take: vi.fn(async (count?: number) =>
          typeof count === "number" ? docs.slice(0, count) : docs,
        ),
      };
    }),
  }));

  return {
    auth: {
      getUserIdentity: vi.fn(),
    },
    storage: {
      delete: vi.fn(async () => undefined),
    },
    scheduler: {
      runAfter: vi.fn(async () => undefined),
    },
    db: {
      get,
      insert,
      patch,
      delete: remove,
      query,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx & QueryCtx;
}
