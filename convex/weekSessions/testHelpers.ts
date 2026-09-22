import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ---------------------------------------------------------------------------
// テスト用型定義
// ---------------------------------------------------------------------------

export type WeekSessionDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  weekStartDate: string;
  weekEndDate: string;
  reviewMemo?: string;
  status: "draft" | "completed";
  createdAt: number;
  updatedAt: number;
};

export type GroupMemberDoc = {
  _id: string;
  _creationTime: number;
  groupId: Id<"groups">;
  userId: string;
  role: "owner" | "member";
};

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

export function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: USER_ID,
    subject: "user-001",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

export const USER_ID = "https://issuer.example|user-001";
export const OTHER_USER_ID = "https://issuer.example|user-002";
export const GROUP_ID = "group-001";
export const OTHER_GROUP_ID = "group-002";

/**
 * MutationCtx の最小モックを生成する。
 *
 * - groupMembers テーブルへの withIndex("by_user_id") クエリは groupMember を返す
 * - weekSessions テーブルへの withIndex は uniqueDoc を返す
 * - ctx.db.get(id) は getDocById で解決する（insert 後は insertedDoc を返す）
 * - ctx.db.insert() は "new-session-id" を返す
 * - ctx.db.patch() / ctx.db.delete() は vi.fn()
 */
export function createMutationCtx(
  identity: UserIdentity | null,
  opts: {
    getDocById?: Record<string, WeekSessionDoc | null>;
    insertedDoc?: WeekSessionDoc;
    updatedDoc?: WeekSessionDoc;
    uniqueDoc?: WeekSessionDoc | null;
    sessions?: WeekSessionDoc[];
    groupMember?: GroupMemberDoc | null;
  } = {},
): MutationCtx {
  const insertMock = vi.fn().mockResolvedValue("new-session-id");
  const patchMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockResolvedValue(undefined);

  const getDocById = opts.getDocById ?? {};
  const insertedDoc = opts.insertedDoc ?? null;
  const updatedDoc = opts.updatedDoc ?? null;

  const defaultGroupMember: GroupMemberDoc | null =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId: GROUP_ID as Id<"groups">,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;
  const groupMember = "groupMember" in opts ? opts.groupMember : defaultGroupMember;

  // insert 後の get と通常の get を区別するために呼び出し回数を追跡
  let insertCalled = false;
  let patchCalled = false;

  const getMock = vi.fn().mockImplementation(async (id: string) => {
    // insert が完了した後の get は insertedDoc を返す
    if (id === "new-session-id" && insertCalled && insertedDoc !== null) {
      return insertedDoc;
    }
    // patch が完了した後の get は updatedDoc を返す
    if (patchCalled && updatedDoc !== null && id === updatedDoc._id) {
      return updatedDoc;
    }
    return getDocById[id] ?? null;
  });

  // insert / patch の後に insertCalled / patchCalled を設定するラッパー
  const insertWrapper = vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await insertMock(...args);
    insertCalled = true;
    return result;
  });

  const patchWrapper = vi.fn().mockImplementation(async (...args: unknown[]) => {
    const result = await patchMock(...args);
    patchCalled = true;
    return result;
  });

  // uniqueDoc が明示的に undefined の場合は opts.uniqueDoc を使う（null はセッションなし）
  const uniqueResult = opts.uniqueDoc !== undefined ? opts.uniqueDoc : null;
  const uniqueMock = vi.fn().mockResolvedValue(uniqueResult);

  const withIndexMock = vi
    .fn()
    .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
      const filters: Record<string, unknown> = {};
      const q = {
        eq: vi.fn().mockImplementation((field: string, value: unknown) => {
          filters[field] = value;
          return q;
        }),
      };
      builder(q);

      // groupMembers テーブルのクエリ
      if (_indexName === "by_user_id") {
        return {
          unique: vi
            .fn()
            .mockResolvedValue(
              groupMember && filters.userId === groupMember.userId ? groupMember : null,
            ),
        };
      }

      if (_indexName === "by_group_id_and_week_start_date") {
        if (opts.sessions === undefined) {
          return { unique: uniqueMock };
        }
        const matched =
          opts.sessions.find(
            (session) =>
              session.groupId === filters.groupId &&
              session.weekStartDate === filters.weekStartDate,
          ) ?? null;
        return { unique: vi.fn().mockResolvedValue(matched) };
      }

      return { unique: uniqueMock };
    });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: getMock,
      insert: insertWrapper,
      patch: patchWrapper,
      delete: deleteMock,
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

/**
 * QueryCtx の最小モックを生成する。
 */
export function createQueryCtx(
  identity: UserIdentity | null,
  opts: {
    uniqueDoc?: WeekSessionDoc | null;
    sessions?: WeekSessionDoc[];
    groupMember?: GroupMemberDoc | null;
  } = {},
): QueryCtx {
  const defaultGroupMember: GroupMemberDoc | null =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId: GROUP_ID as Id<"groups">,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;
  const groupMember = "groupMember" in opts ? opts.groupMember : defaultGroupMember;

  // uniqueDoc が明示的に undefined の場合は null
  const uniqueResult = opts.uniqueDoc !== undefined ? opts.uniqueDoc : null;
  const uniqueMock = vi.fn().mockResolvedValue(uniqueResult);

  const withIndexMock = vi
    .fn()
    .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
      const filters: Record<string, unknown> = {};
      const q = {
        eq: vi.fn().mockImplementation((field: string, value: unknown) => {
          filters[field] = value;
          return q;
        }),
      };
      builder(q);

      // groupMembers テーブルのクエリ
      if (_indexName === "by_user_id") {
        return {
          unique: vi
            .fn()
            .mockResolvedValue(
              groupMember && filters.userId === groupMember.userId ? groupMember : null,
            ),
        };
      }

      if (_indexName === "by_group_id_and_week_start_date") {
        if (opts.sessions === undefined) {
          return { unique: uniqueMock };
        }
        const matched =
          opts.sessions.find(
            (session) =>
              session.groupId === filters.groupId &&
              session.weekStartDate === filters.weekStartDate,
          ) ?? null;
        return { unique: vi.fn().mockResolvedValue(matched) };
      }

      return { unique: uniqueMock };
    });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: vi.fn().mockResolvedValue(null),
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as QueryCtx;
}

// ---------------------------------------------------------------------------
// テスト用フィクスチャ
// ---------------------------------------------------------------------------

export const sampleSession: WeekSessionDoc = {
  _id: "session-001",
  _creationTime: 1000,
  groupId: GROUP_ID,
  weekStartDate: "2024-01-08",
  weekEndDate: "2024-01-14",
  status: "draft",
  createdAt: 1000,
  updatedAt: 1000,
};

export const otherGroupSession: WeekSessionDoc = {
  _id: "session-other",
  _creationTime: 1000,
  groupId: OTHER_GROUP_ID,
  weekStartDate: "2024-01-08",
  weekEndDate: "2024-01-14",
  status: "draft",
  createdAt: 1000,
  updatedAt: 1000,
};

// ---------------------------------------------------------------------------
// getOrCreateCurrentWeekSession テスト
// ---------------------------------------------------------------------------
