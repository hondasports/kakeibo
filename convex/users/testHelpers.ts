import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import { requireAuthenticatedUserId } from "./auth";

export type AuthContext = Parameters<typeof requireAuthenticatedUserId>[0];

export function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|clerk-user-token",
    subject: "clerk-user-subject",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

export function createAuthContext(identity: UserIdentity | null): AuthContext {
  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
  };
}

export type Doc = {
  _id: string;
  _creationTime: number;
  userId: string;
  displayName: string;
  email?: string;
  monthlyIncome?: number;
  weeklyStartDay?: number;
  weeklyEndDay?: number;
  receiptImageExternalApiConsentAcceptedAt?: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * upsertUserHandler が必要とする MutationCtx の最小モックを生成する。
 * existingDoc が null のとき初回ログイン（insert）、Doc のとき2回目以降（patch）を再現する。
 */
export function createMutationCtx(
  identity: UserIdentity | null,
  existingDoc: Doc | null = null,
): MutationCtx {
  const insertMock = vi.fn().mockResolvedValue("new-doc-id");
  const patchMock = vi.fn().mockResolvedValue(undefined);

  const uniqueMock = vi.fn().mockResolvedValue(existingDoc);
  const withIndexMock = vi.fn().mockReturnValue({ unique: uniqueMock });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      query: queryMock,
      insert: insertMock,
      patch: patchMock,
      // 以下は今回のハンドラーでは未使用だがMutationCtx型を満たすためにキャスト
    },
    // TODO: MutationCtx の完全な型を満たす型安全なモックファクトリーへの置き換えを検討する
    //       現状は as any as MutationCtx で型チェックをバイパスしているため、
    //       将来的には convex-test などのテストユーティリティの活用を検討してください。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

// ---------------------------------------------------------------------------
// upsertUser テスト
// ---------------------------------------------------------------------------

export function createQueryCtxForUsers(
  identity: UserIdentity | null,
  existingDoc: Doc | null = null,
): QueryCtx {
  const uniqueMock = vi.fn().mockResolvedValue(existingDoc);
  const withIndexMock = vi.fn().mockReturnValue({ unique: uniqueMock });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      query: queryMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as QueryCtx;
}

/**
 * updateMonthlyIncomeHandler が必要とする MutationCtx の最小モックを生成する。
 * existingDoc が null のとき user が存在しない場合、Doc のとき更新対象がある場合を再現する。
 */
export function createMutationCtxForUpdate(
  identity: UserIdentity | null,
  existingDoc: Doc | null = null,
): MutationCtx {
  const patchMock = vi.fn().mockResolvedValue(undefined);

  const uniqueMock = vi.fn().mockResolvedValue(existingDoc);
  const withIndexMock = vi.fn().mockReturnValue({ unique: uniqueMock });
  const queryMock = vi.fn().mockReturnValue({ withIndex: withIndexMock });

  // patch 後の get は existingDoc と同じ doc を返す（updatedDoc として使用）
  const getMock = vi.fn().mockImplementation(async (_id: string) => existingDoc);

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      query: queryMock,
      patch: patchMock,
      get: getMock,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as MutationCtx;
}

// ---------------------------------------------------------------------------
// getUserProfile テスト
// ---------------------------------------------------------------------------

export const BASE_DOC: Doc = {
  _id: "doc-001",
  _creationTime: 1000,
  userId: "https://issuer.example|user-001",
  displayName: "テストユーザー",
  createdAt: 1000,
  updatedAt: 1000,
};
