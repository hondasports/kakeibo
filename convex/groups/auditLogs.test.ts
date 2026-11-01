import type { UserIdentity } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordManagementAuditLog } from "./lib/managementAuditLog";
import type { GroupRole } from "../../lib/domain/groups/role";
import { listManagementAuditLogsHandler, MANAGEMENT_AUDIT_LOG_LIST_LIMIT } from "./auditLogs";

type ManagementAuditLogDoc = {
  _id: Id<"managementAuditLogs">;
  groupId: Id<"groups">;
  actorUserId: string;
  action:
    | "group_name_changed"
    | "member_removed"
    | "invitation_revoked"
    | "member_role_changed"
    | "owner_transferred"
    | "group_archived"
    | "group_deleted"
    | "system_admin_granted"
    | "system_admin_revoked"
    | "system_admin_delegated"
    | "spending_bulk_category_changed"
    | "spending_bulk_deleted";
  targetKind: "group" | "member" | "invitation";
  targetId?: string;
  targetLabel?: string;
  beforeValue?: string;
  afterValue?: string;
  createdAt: number;
};

type UserDoc = {
  _id: Id<"users">;
  userId: string;
  displayName: string;
  email?: string;
  activeGroupId?: Id<"groups">;
  createdAt: number;
  updatedAt: number;
};

type GroupMemberDoc = {
  _id: Id<"groupMembers">;
  groupId: Id<"groups">;
  userId: string;
  role: GroupRole;
  createdAt: number;
  updatedAt: number;
};

function createIdentity(userId: string, email = "owner@example.com"): UserIdentity {
  return {
    tokenIdentifier: userId,
    subject: userId,
    issuer: "https://issuer.example",
    email,
  };
}

function createMockDb(state: {
  users?: UserDoc[];
  groupMembers?: GroupMemberDoc[];
  managementAuditLogs?: ManagementAuditLogDoc[];
}) {
  const users = [...(state.users ?? [])];
  const groupMembers = [...(state.groupMembers ?? [])];
  const managementAuditLogs = [...(state.managementAuditLogs ?? [])];

  const insert = vi.fn(async (tableName: string, doc: Record<string, unknown>) => {
    const id = `${tableName}-${insert.mock.calls.length}` as Id<
      "users" | "groupMembers" | "managementAuditLogs"
    >;
    const created = { _id: id, _creationTime: Date.now(), ...doc } as never;
    if (tableName === "users") users.push(created as UserDoc);
    if (tableName === "groupMembers") groupMembers.push(created as GroupMemberDoc);
    if (tableName === "managementAuditLogs") {
      managementAuditLogs.push(created as ManagementAuditLogDoc);
    }
    return id;
  });

  const get = vi.fn(async (id: string) => {
    return (
      [...users, ...groupMembers, ...managementAuditLogs].find((doc) => doc._id === id) ?? null
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
        if (tableName === "users") {
          return indexName === "by_token_identifier" || indexName === "by_email";
        }
        if (tableName === "groupMembers") {
          return (
            indexName === "by_user_id" ||
            indexName === "by_group_id" ||
            indexName === "by_group_id_and_user_id"
          );
        }
        if (tableName === "managementAuditLogs") {
          return indexName === "by_group_id_and_created_at";
        }
        return false;
      };

      if (!isSupportedIndex()) {
        throw new Error(`Unsupported mock index: ${tableName}.${indexName}`);
      }

      const filterDocs = () => {
        const source =
          tableName === "users"
            ? users
            : tableName === "groupMembers"
              ? groupMembers
              : managementAuditLogs;

        return source.filter((doc) => {
          if (indexName === "by_token_identifier" && "userId" in doc) {
            return doc.userId === filters.userId;
          }
          if (indexName === "by_user_id" && "userId" in doc) {
            return doc.userId === filters.userId;
          }
          if (indexName === "by_group_id_and_user_id" && "groupId" in doc && "userId" in doc) {
            return doc.groupId === filters.groupId && doc.userId === filters.userId;
          }
          if (indexName === "by_group_id_and_created_at" && "groupId" in doc) {
            return doc.groupId === filters.groupId;
          }
          return false;
        });
      };

      const docs = filterDocs();
      return {
        order: vi.fn((direction: "asc" | "desc") => ({
          take: vi.fn(async (count: number) => {
            const sorted = [...docs].sort((left, right) =>
              direction === "desc"
                ? right.createdAt - left.createdAt
                : left.createdAt - right.createdAt,
            );
            return sorted.slice(0, count);
          }),
        })),
        collect: vi.fn(async () => docs),
        unique: vi.fn(async () => {
          if (docs.length > 1) {
            throw new Error(`Mock unique() received ${docs.length} documents`);
          }
          return docs[0] ?? null;
        }),
      };
    }),
  }));

  return {
    auth: {
      getUserIdentity: vi.fn(),
    },
    db: {
      get,
      insert,
      query,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx & QueryCtx;
}

describe("recordManagementAuditLog", () => {
  it("管理操作の監査ログを挿入する", async () => {
    const ctx = createMockDb({});
    const groupId = "group-001" as Id<"groups">;
    const actorUserId = "https://issuer.example|owner";

    const logId = await recordManagementAuditLog(ctx, {
      groupId,
      actorUserId,
      action: "group_name_changed",
      targetKind: "group",
      targetLabel: "佐藤家",
      beforeValue: "佐藤家",
      afterValue: "鈴木家",
    });

    expect(logId).toMatch(/^managementAuditLogs-/);
    expect(ctx.db.insert).toHaveBeenCalledWith(
      "managementAuditLogs",
      expect.objectContaining({
        groupId,
        actorUserId,
        action: "group_name_changed",
        targetKind: "group",
        beforeValue: "佐藤家",
        afterValue: "鈴木家",
      }),
    );
  });
});

describe("listManagementAuditLogsHandler", () => {
  const ownerId = "https://issuer.example|owner";
  const groupId = "group-001" as Id<"groups">;

  it("owner は自グループの監査ログを新しい順で取得する", async () => {
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: groupId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      managementAuditLogs: [
        {
          _id: "log-001" as Id<"managementAuditLogs">,
          groupId,
          actorUserId: ownerId,
          action: "group_name_changed",
          targetKind: "group",
          targetLabel: "佐藤家",
          beforeValue: "佐藤家",
          afterValue: "鈴木家",
          createdAt: 2000,
        },
        {
          _id: "log-002" as Id<"managementAuditLogs">,
          groupId: "group-002" as Id<"groups">,
          actorUserId: ownerId,
          action: "member_removed",
          targetKind: "member",
          targetLabel: "他グループメンバー",
          createdAt: 3000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    const logs = await listManagementAuditLogsHandler(ctx);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "group_name_changed",
      actionLabel: "グループ名を変更",
      actorDisplayName: "オーナー",
      targetLabel: "佐藤家",
      beforeValue: "佐藤家",
      afterValue: "鈴木家",
      createdAt: 2000,
    });
  });

  it("member ロールの呼び出しを拒否する", async () => {
    const memberId = "https://issuer.example|member";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-member" as Id<"users">,
          userId: memberId,
          displayName: "メンバー",
          activeGroupId: groupId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-member" as Id<"groupMembers">,
          groupId,
          userId: memberId,
          role: "member",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi
      .fn()
      .mockResolvedValue(createIdentity(memberId, "member@example.com"));

    await expect(listManagementAuditLogsHandler(ctx)).rejects.toThrow(
      "グループオーナーのみ実行できます",
    );
  });

  it(`取得件数は ${MANAGEMENT_AUDIT_LOG_LIST_LIMIT} 件まで`, async () => {
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: groupId,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      managementAuditLogs: Array.from(
        { length: MANAGEMENT_AUDIT_LOG_LIST_LIMIT + 5 },
        (_, index) => ({
          _id: `log-${index}` as Id<"managementAuditLogs">,
          groupId,
          actorUserId: ownerId,
          action: "invitation_revoked" as const,
          targetKind: "invitation" as const,
          targetLabel: `invite-${index}@example.com`,
          createdAt: 1000 + index,
        }),
      ),
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    const logs = await listManagementAuditLogsHandler(ctx);

    expect(logs).toHaveLength(MANAGEMENT_AUDIT_LOG_LIST_LIMIT);
    expect(logs[0]?.createdAt).toBe(1000 + MANAGEMENT_AUDIT_LOG_LIST_LIMIT + 4);
  });

  it("同一 actorUserId のログはユーザー lookup を重複しない", async () => {
    const actorA = "https://issuer.example|owner-a";
    const actorB = "https://issuer.example|owner-b";
    const ctx = createMockDb({
      users: [
        {
          _id: "user-owner" as Id<"users">,
          userId: ownerId,
          displayName: "オーナー",
          activeGroupId: groupId,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-a" as Id<"users">,
          userId: actorA,
          displayName: "Actor A",
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          _id: "user-b" as Id<"users">,
          userId: actorB,
          displayName: "Actor B",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      groupMembers: [
        {
          _id: "member-owner" as Id<"groupMembers">,
          groupId,
          userId: ownerId,
          role: "owner",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      managementAuditLogs: [
        {
          _id: "log-001" as Id<"managementAuditLogs">,
          groupId,
          actorUserId: actorA,
          action: "group_name_changed",
          targetKind: "group",
          createdAt: 3000,
        },
        {
          _id: "log-002" as Id<"managementAuditLogs">,
          groupId,
          actorUserId: actorA,
          action: "member_removed",
          targetKind: "member",
          createdAt: 2000,
        },
        {
          _id: "log-003" as Id<"managementAuditLogs">,
          groupId,
          actorUserId: actorB,
          action: "invitation_revoked",
          targetKind: "invitation",
          createdAt: 1000,
        },
      ],
    });
    ctx.auth.getUserIdentity = vi.fn().mockResolvedValue(createIdentity(ownerId));

    const queryMock = vi.mocked(ctx.db.query);
    const userQueryCountBefore = queryMock.mock.calls.filter(
      ([tableName]: [string]) => tableName === "users",
    ).length;

    const logs = await listManagementAuditLogsHandler(ctx);

    const userQueryCountAfter = queryMock.mock.calls.filter(
      ([tableName]: [string]) => tableName === "users",
    ).length;

    expect(logs).toHaveLength(3);
    expect(logs.map((log) => log.actorDisplayName)).toEqual(["Actor A", "Actor A", "Actor B"]);
    // requireGroupOwner の users lookup 1 回 + 重複排除後の actor lookup 2 回
    expect(userQueryCountAfter - userQueryCountBefore).toBe(1 + new Set([actorA, actorB]).size);
  });
});
