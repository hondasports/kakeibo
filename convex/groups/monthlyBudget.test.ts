import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { setMonthlyBudgetHandler } from "./mutations";
import { createIdentity, createMockDb } from "./testHelpers";

const OWNER = "https://issuer.example|budget-owner";
const MEMBER = "https://issuer.example|budget-member";
const GROUP = "group-budget" as Id<"groups">;

function createCtx(userId: string, opts: { role: "owner" | "member"; monthlyBudgetYen?: number }) {
  const ctx = createMockDb({
    groups: [
      {
        _id: GROUP,
        name: "予算テスト家",
        ...(opts.monthlyBudgetYen !== undefined
          ? ({ monthlyBudgetYen: opts.monthlyBudgetYen } as object)
          : {}),
        createdAt: 1000,
        updatedAt: 1000,
      } as never,
    ],
    users: [
      {
        _id: `user-${opts.role}` as Id<"users">,
        userId,
        displayName: opts.role,
        email: `${opts.role}@example.com`,
        activeGroupId: GROUP,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    groupMembers: [
      {
        _id: `gm-${opts.role}` as Id<"groupMembers">,
        groupId: GROUP,
        userId,
        role: opts.role,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  });
  ctx.auth.getUserIdentity = vi
    .fn()
    .mockResolvedValue(createIdentity(userId, `${opts.role}@example.com`));
  return ctx;
}

function auditInserts(ctx: { db: { insert: ReturnType<typeof vi.fn> } }) {
  return ctx.db.insert.mock.calls.filter((c) => c[0] === "managementAuditLogs");
}

describe("setMonthlyBudget (server)", () => {
  it("member は拒否される", async () => {
    const ctx = createCtx(MEMBER, { role: "member" });
    await expect(
      setMonthlyBudgetHandler(ctx as unknown as MutationCtx, {
        monthlyBudgetYen: 300000,
      }),
    ).rejects.toThrow("グループオーナーのみ実行できます");
    expect(auditInserts(ctx as never)).toHaveLength(0);
  });

  it("owner が保存し before/after 付きの監査ログを残す", async () => {
    const ctx = createCtx(OWNER, { role: "owner" });
    await setMonthlyBudgetHandler(ctx as unknown as MutationCtx, {
      monthlyBudgetYen: 300000,
    });
    const audits = auditInserts(ctx as never);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toMatchObject({
      groupId: GROUP,
      actorUserId: OWNER,
      action: "group_monthly_budget_changed",
      targetKind: "group",
      targetId: GROUP,
      beforeValue: "未設定",
      afterValue: "300000",
    });
    const group = await ctx.db.get(GROUP);
    expect((group as { monthlyBudgetYen?: number }).monthlyBudgetYen).toBe(300000);
  });

  it("null で解除し監査ログが before=旧値 after=未設定", async () => {
    const ctx = createCtx(OWNER, { role: "owner", monthlyBudgetYen: 300000 });
    await setMonthlyBudgetHandler(ctx as unknown as MutationCtx, {
      monthlyBudgetYen: null,
    });
    const audits = auditInserts(ctx as never);
    expect(audits).toHaveLength(1);
    expect(audits[0][1]).toMatchObject({
      action: "group_monthly_budget_changed",
      beforeValue: "300000",
      afterValue: "未設定",
    });
    const group = await ctx.db.get(GROUP);
    expect((group as { monthlyBudgetYen?: number }).monthlyBudgetYen).toBeUndefined();
  });

  it("同じ値を再設定しても監査ログを重複しない", async () => {
    const ctx = createCtx(OWNER, { role: "owner", monthlyBudgetYen: 300000 });
    await setMonthlyBudgetHandler(ctx as unknown as MutationCtx, {
      monthlyBudgetYen: 300000,
    });
    expect(auditInserts(ctx as never)).toHaveLength(0);
  });
});
