import type { UserIdentity } from "convex/server";
import { vi } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";

export const GROUP_ID = "group-001" as Id<"groups">;
export const DRAFT_ID = "draft-tax" as Id<"aiExpenseDrafts">;
export const CAT_ID = "cat-food" as Id<"categories">;

export function createIdentity(): UserIdentity {
  return {
    tokenIdentifier: "https://issuer.example|user-001",
    subject: "user-001",
    issuer: "https://issuer.example",
  };
}

export type StoredDoc = Record<string, unknown> & { _id: string };

export function createInMemoryMutationCtx(initial: { draft: StoredDoc; items: StoredDoc[] }): {
  ctx: MutationCtx;
  getDraft: () => StoredDoc;
  getItems: () => StoredDoc[];
} {
  const docs = new Map<string, StoredDoc>();
  docs.set(initial.draft._id, { ...initial.draft });
  for (const item of initial.items) {
    docs.set(item._id, { ...item });
  }
  let insertCounter = 0;

  const groupMember = {
    _id: "member-001",
    _creationTime: 1000,
    groupId: GROUP_ID,
    userId: createIdentity().tokenIdentifier,
    role: "owner",
  };

  const ctx = {
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue(createIdentity()),
    },
    db: {
      get: vi.fn(async (id: string) => docs.get(id) ?? null),
      patch: vi.fn(async (id: string, fields: Record<string, unknown>) => {
        const current = docs.get(id);
        if (current) {
          docs.set(id, { ...current, ...fields });
        }
      }),
      insert: vi.fn(async (_table: string, doc: Record<string, unknown>) => {
        insertCounter += 1;
        const id = `item-new-${insertCounter}`;
        docs.set(id, { _id: id, ...doc });
        return id;
      }),
      delete: vi.fn(async (id: string) => {
        docs.delete(id);
      }),
      query: vi.fn(() => ({
        withIndex: vi.fn((indexName: string, builder?: (q: unknown) => unknown) => {
          if (indexName === "by_user_id") {
            const q = { eq: vi.fn().mockImplementation(() => q) };
            builder?.(q);
            return { unique: vi.fn().mockResolvedValue(groupMember) };
          }
          const filters: Record<string, unknown> = {};
          const q = {
            eq: vi.fn().mockImplementation((field: string, value: unknown) => {
              filters[field] = value;
              return q;
            }),
          };
          builder?.(q);
          const filtered = [...docs.values()].filter((doc) =>
            Object.entries(filters).every(([field, value]) => doc[field] === value),
          );
          return {
            take: vi
              .fn()
              .mockImplementation(async (limit?: number) =>
                typeof limit === "number" ? filtered.slice(0, limit) : filtered,
              ),
            collect: vi.fn().mockResolvedValue(filtered),
            order: vi.fn().mockReturnValue({
              take: vi.fn().mockResolvedValue(filtered),
              collect: vi.fn().mockResolvedValue(filtered),
            }),
          };
        }),
      })),
    },
  } as unknown as MutationCtx;

  docs.set(CAT_ID, { _id: CAT_ID, groupId: GROUP_ID, isActive: true });

  return {
    ctx,
    getDraft: () => docs.get(DRAFT_ID)!,
    getItems: () =>
      [...docs.values()].filter(
        (doc) => doc.draftId === DRAFT_ID && doc._id !== DRAFT_ID && doc._id !== CAT_ID,
      ),
  };
}

export const externalTaxSummaries = [
  {
    taxRatePercent: 8 as const,
    taxMode: "external" as const,
    taxableAmountYen: 100,
    taxableAmountBasis: "tax_excluded" as const,
    taxYen: 8,
    roundingMethod: "unknown" as const,
    confidence: {},
    warnings: [] as string[],
  },
];
