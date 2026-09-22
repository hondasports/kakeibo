import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { ActionCtx } from "../_generated/server";

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

export const GROUP_ID = "group-001";

/**
 * ActionCtx の最小モックを生成する。
 *
 * - ctx.auth.getUserIdentity() は identity を返す
 * - ctx.db.query("groupMembers").withIndex("by_user_id").unique() はグループメンバーを返す
 */
export function createActionCtx(identity: UserIdentity | null): ActionCtx {
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

  return {
    auth: {
      getUserIdentity: vi.fn<() => Promise<UserIdentity | null>>().mockResolvedValue(identity),
    },
    db: {
      query: vi.fn().mockImplementation((_tableName: string) => ({
        withIndex: vi
          .fn()
          .mockImplementation((_indexName: string, builder?: (q: unknown) => unknown) => {
            if (builder) {
              const q = { eq: vi.fn().mockImplementation(() => q) };
              builder(q);
            }
            return { unique: vi.fn().mockResolvedValue(groupMember) };
          }),
      })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as ActionCtx;
}

/**
 * process.env をテスト用の値で上書きし、テスト後に復元するヘルパー。
 */
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

/** 有効な data URL スタブ（テスト用の小さな文字列） */
export const VALID_IMAGE_DATA_URL = "data:image/jpeg;base64," + "A".repeat(100);

/** 5MB を超える data URL スタブ */
export const OVERSIZED_IMAGE_DATA_URL = "data:image/jpeg;base64," + "A".repeat(5_000_001);

export function getTodayDateStringInJapan() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("JST 日付の生成に失敗しました");
  }
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------
