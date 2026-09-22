import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
    ...overrides,
  };
}

export const GROUP_ID = "group-001";

export function createMutationCtx(
  identity: UserIdentity | null,
  opts: {
    docs?: Record<string, unknown>;
    insertedIds?: string[];
    queryResult?: unknown[];
  } = {},
): MutationCtx {
  const insertedIds = opts.insertedIds ?? ["new-batch-id", "new-job-id-0", "new-job-id-1"];
  let insertCallCount = 0;
  const insertMock = vi.fn().mockImplementation(async () => {
    const nextId = insertedIds[Math.min(insertCallCount, insertedIds.length - 1)];
    insertCallCount += 1;
    return nextId;
  });
  const patchMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockResolvedValue(undefined);
  const runAfterMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockImplementation(async (id: string) => {
    if (opts.docs && id in opts.docs) {
      return opts.docs[id];
    }
    return null;
  });

  const groupMember =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId: GROUP_ID,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;

  const queryMock = vi.fn().mockImplementation((_tableName: string) => ({
    withIndex: vi
      .fn()
      .mockImplementation((_indexName: string, builder?: (q: unknown) => unknown) => {
        // groupMembers の by_user_id クエリはグループメンバーを返す
        if (_indexName === "by_user_id") {
          if (builder) {
            const q = { eq: vi.fn().mockImplementation(() => q) };
            builder(q);
          }
          return { unique: vi.fn().mockResolvedValue(groupMember) };
        }
        return {
          collect: vi.fn().mockResolvedValue(opts.queryResult ?? []),
          unique: vi.fn().mockResolvedValue(null),
        };
      }),
  }));

  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(identity),
    },
    scheduler: {
      runAfter: runAfterMock,
    },
    db: {
      insert: insertMock,
      patch: patchMock,
      get: getMock,
      delete: deleteMock,
      query: queryMock,
    },
  } as unknown as MutationCtx;
}

export function createQueryCtx(
  identity: UserIdentity | null,
  opts: {
    docs?: Record<string, unknown>;
    queryResult?: unknown[];
  } = {},
): QueryCtx {
  const getMock = vi.fn().mockImplementation(async (id: string) => {
    if (opts.docs && id in opts.docs) {
      return opts.docs[id];
    }
    return null;
  });

  const groupMember =
    identity !== null
      ? {
          _id: "member-001",
          _creationTime: 1000,
          groupId: GROUP_ID,
          userId: identity.tokenIdentifier,
          role: "owner",
        }
      : null;

  const queryMock = vi.fn().mockImplementation((_tableName: string) => ({
    withIndex: vi
      .fn()
      .mockImplementation((_indexName: string, builder?: (q: unknown) => unknown) => {
        // groupMembers の by_user_id クエリはグループメンバーを返す
        if (_indexName === "by_user_id") {
          if (builder) {
            const q = { eq: vi.fn().mockImplementation(() => q) };
            builder(q);
          }
          return { unique: vi.fn().mockResolvedValue(groupMember) };
        }
        return {
          order: vi.fn().mockImplementation(() => ({
            take: vi.fn().mockResolvedValue(opts.queryResult ?? []),
            collect: vi.fn().mockResolvedValue(opts.queryResult ?? []),
          })),
          unique: vi.fn().mockResolvedValue(null),
        };
      }),
  }));

  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(identity),
    },
    db: {
      get: getMock,
      query: queryMock,
    },
  } as unknown as QueryCtx;
}

export function createActionCtx(
  identity: UserIdentity | null,
  opts: {
    runQueryResults?: Record<string, unknown>;
    runMutationResults?: Record<string, unknown>;
  } = {},
): ActionCtx {
  const runQueryMock = vi.fn().mockImplementation(async (_ref: unknown, _args: unknown) => {
    return opts.runQueryResults ?? {};
  });
  const runMutationMock = vi.fn().mockImplementation(async (_ref: unknown, _args: unknown) => {
    return opts.runMutationResults ?? {};
  });

  return {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(identity),
    },
    runQuery: runQueryMock,
    runMutation: runMutationMock,
  } as unknown as ActionCtx;
}

export async function withEnv(
  envVars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(envVars)) {
    original[key] = process.env[key];
    if (envVars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envVars[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

export const VALID_IMAGE_DATA_URL = "data:image/jpeg;base64," + "A".repeat(100);

export function createInternalCtx({
  docs = {},
  jobs = [],
  batches = [],
}: {
  docs?: Record<string, unknown>;
  jobs?: unknown[];
  batches?: unknown[];
} = {}) {
  const get = vi.fn().mockImplementation(async (id: string) => docs[id] ?? null);
  const patch = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const runAfter = vi.fn().mockResolvedValue(undefined);
  const query = vi.fn().mockImplementation((tableName: string) => ({
    withIndex: vi
      .fn()
      .mockImplementation((_indexName: string, builder?: (q: unknown) => unknown) => {
        const q = {
          eq: vi.fn().mockImplementation(() => q),
        };
        builder?.(q);
        const rows = tableName === "receiptAnalysisBatches" ? batches : jobs;
        return {
          order: vi.fn().mockReturnThis(),
          collect: vi.fn().mockResolvedValue(rows),
          take: vi
            .fn()
            .mockImplementation(async (limit: number) =>
              tableName === "receiptAnalysisBatches" ? rows.slice(0, limit) : rows,
            ),
        };
      }),
  }));

  return {
    db: { get, patch, delete: remove, query },
    scheduler: { runAfter },
  } as unknown as MutationCtx & QueryCtx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
