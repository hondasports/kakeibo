import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// ---------------------------------------------------------------------------
// テスト用ヘルパー
// ---------------------------------------------------------------------------

export function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

export type CategoryDoc = {
  _id: string;
  _creationTime: number;
  groupId: string;
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
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

/**
 * seedDefaultCategoriesHandler が必要とする MutationCtx の最小モックを生成する。
 *
 * - groupMembers テーブルへの withIndex("by_user_id") クエリは groupMember を返す
 * - categories テーブルへの withIndex は existingDocs から groupId/sortOrder でフィルタ
 */
export function createMutationCtx(
  identity: UserIdentity | null,
  existingDocs: CategoryDoc[] = [],
  groupMember: GroupMemberDoc | null = identity
    ? {
        _id: "member-001",
        _creationTime: 1000,
        groupId: "group-001" as Id<"groups">,
        userId: identity.tokenIdentifier,
        role: "owner",
      }
    : null,
): MutationCtx {
  const insertMock = vi.fn().mockResolvedValue("new-doc-id");
  const patchMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockImplementation(async (id: string) => {
    return existingDocs.find((doc) => doc._id === id) ?? null;
  });

  const withIndexMock = vi
    .fn()
    .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
      // groupMembers テーブル用のフィルタリング
      let capturedGroupId: string | null = null;
      let capturedIsActive: boolean | null = null;
      let capturedSortOrder: number | null = null;

      const q = {
        eq: vi.fn().mockImplementation((_field: string, _value: unknown) => {
          if (_field === "groupId") {
            capturedGroupId = _value as string;
          }
          if (_field === "isActive") {
            capturedIsActive = _value as boolean;
          }
          if (_field === "sortOrder") {
            capturedSortOrder = _value as number;
          }
          return q; // self-referential chain
        }),
      };

      // builder を実行してフィールドをキャプチャさせる
      builder(q);

      // groupMembers テーブルのクエリは groupMember を返す
      if (_indexName === "by_user_id") {
        return {
          unique: vi.fn().mockResolvedValue(groupMember),
        };
      }

      // categories テーブルのクエリ: groupId/sortOrder でフィルタ
      const docs = existingDocs.filter((d) => {
        if (capturedGroupId !== null && d.groupId !== capturedGroupId) return false;
        if (capturedIsActive !== null && d.isActive !== capturedIsActive) return false;
        if (capturedSortOrder !== null && d.sortOrder !== capturedSortOrder) return false;
        return true;
      });

      const chain: Record<string, unknown> = {
        collect: vi.fn().mockResolvedValue(docs),
        first: vi.fn().mockResolvedValue(docs[0] ?? null),
        take: vi.fn().mockImplementation(async (limit?: number) => {
          return typeof limit === "number" ? docs.slice(0, limit) : docs;
        }),
        unique: vi.fn().mockResolvedValue(docs[0] ?? null),
      };
      chain.order = vi.fn().mockImplementation((direction?: "asc" | "desc") => {
        const sortedDocs = [...docs].sort((a, b) => a.sortOrder - b.sortOrder);
        const orderedDocs = direction === "desc" ? sortedDocs.reverse() : sortedDocs;
        return {
          collect: vi.fn().mockResolvedValue(orderedDocs),
          first: vi.fn().mockResolvedValue(orderedDocs[0] ?? null),
          take: vi.fn().mockImplementation(async (limit?: number) => {
            return typeof limit === "number" ? orderedDocs.slice(0, limit) : orderedDocs;
          }),
          unique: vi.fn().mockResolvedValue(orderedDocs[0] ?? null),
        };
      });
      return chain;
    });

  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      get: getMock,
      query: queryMock,
      insert: insertMock,
      patch: patchMock,
    },
    // TODO: MutationCtx の完全な型を満たす型安全なモックファクトリーへの置き換えを検討する
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

/**
 * listActiveHandler が必要とする QueryCtx の最小モックを生成する。
 */
export function createQueryCtx(
  identity: UserIdentity | null,
  docs: CategoryDoc[] = [],
  groupMember: GroupMemberDoc | null = identity
    ? {
        _id: "member-001",
        _creationTime: 1000,
        groupId: "group-001" as Id<"groups">,
        userId: identity.tokenIdentifier,
        role: "owner",
      }
    : null,
): QueryCtx {
  const withIndexMock = vi
    .fn()
    .mockImplementation((_indexName: string, builder: (q: unknown) => unknown) => {
      let capturedGroupId: string | null = null;
      let capturedIsActive: boolean | null = null;

      const q = {
        eq: vi.fn().mockImplementation((_field: string, _value: unknown) => {
          if (_field === "groupId") {
            capturedGroupId = _value as string;
          }
          if (_field === "isActive") {
            capturedIsActive = _value as boolean;
          }
          return q;
        }),
      };
      builder(q);

      // groupMembers テーブルのクエリ
      if (_indexName === "by_user_id") {
        return {
          unique: vi.fn().mockResolvedValue(groupMember),
        };
      }

      const filteredDocs = docs.filter((doc) => {
        if (capturedGroupId !== null && doc.groupId !== capturedGroupId) return false;
        if (capturedIsActive !== null && doc.isActive !== capturedIsActive) return false;
        return true;
      });

      const orderMock = vi.fn().mockImplementation((direction?: "asc" | "desc") => {
        const orderedDocs = [...filteredDocs].sort((a, b) => a.sortOrder - b.sortOrder);
        if (direction === "desc") {
          orderedDocs.reverse();
        }
        return {
          collect: vi.fn().mockResolvedValue(orderedDocs),
          take: vi
            .fn()
            .mockImplementation(async (limit?: number) =>
              typeof limit === "number" ? orderedDocs.slice(0, limit) : orderedDocs,
            ),
        };
      });
      const takeMock = vi
        .fn()
        .mockImplementation(async (limit?: number) =>
          typeof limit === "number" ? filteredDocs.slice(0, limit) : filteredDocs,
        );

      return { order: orderMock, take: takeMock };
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
// seedDefaultCategories テスト
// ---------------------------------------------------------------------------
