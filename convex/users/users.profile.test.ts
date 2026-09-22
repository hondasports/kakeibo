import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { getReceiptImageConsentHandler, getUserProfileHandler } from "./queries";
import { acceptReceiptImageExternalApiConsentHandler, updateMonthlyIncomeHandler, updateWeeklyDaysHandler } from "./mutations";
import type { Doc } from "./testHelpers";
import { createIdentity, createQueryCtxForUsers, createMutationCtxForUpdate, BASE_DOC } from "./testHelpers";

describe("getUserProfile", () => {
  it("未認証時は ConvexError を throw する", async () => {
    const ctx = createQueryCtxForUsers(null);

    await expect(getUserProfileHandler(ctx)).rejects.toBeInstanceOf(ConvexError);
    await expect(getUserProfileHandler(ctx)).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("userが存在する場合に monthlyIncome を返す", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-with-income",
    });
    const existingDoc: Doc = {
      _id: "doc-001",
      _creationTime: 1000,
      userId: "https://issuer.example|user-with-income",
      displayName: "テストユーザー",
      monthlyIncome: 300000,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForUsers(identity, existingDoc);

    const result = await getUserProfileHandler(ctx);

    expect(result).toEqual({ monthlyIncome: 300000, weeklyStartDay: 1, weeklyEndDay: 0 });
  });

  it("monthlyIncome が未設定の場合は null を返す", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-no-income",
    });
    const existingDoc: Doc = {
      _id: "doc-002",
      _creationTime: 1000,
      userId: "https://issuer.example|user-no-income",
      displayName: "テストユーザー",
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForUsers(identity, existingDoc);

    const result = await getUserProfileHandler(ctx);

    expect(result).toEqual({ monthlyIncome: null, weeklyStartDay: 1, weeklyEndDay: 0 });
  });

  it("userが存在しない場合は undefined を返す", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-not-found",
    });
    const ctx = createQueryCtxForUsers(identity, null);

    const result = await getUserProfileHandler(ctx);

    expect(result).toBeUndefined();
  });
});

describe("receipt image external API consent", () => {
  it("未認証時は同意状態を取得できない", async () => {
    const ctx = createQueryCtxForUsers(null);

    await expect(getReceiptImageConsentHandler(ctx)).rejects.toBeInstanceOf(ConvexError);
    await expect(getReceiptImageConsentHandler(ctx)).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("同意済み時は acceptedAt を返す", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-consented",
    });
    const existingDoc: Doc = {
      _id: "doc-consented",
      _creationTime: 1000,
      userId: "https://issuer.example|user-consented",
      displayName: "同意済みユーザー",
      receiptImageExternalApiConsentAcceptedAt: 1234567890,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForUsers(identity, existingDoc);

    await expect(getReceiptImageConsentHandler(ctx)).resolves.toEqual({
      hasAcceptedExternalApiConsent: true,
      acceptedAt: 1234567890,
    });
  });

  it("未同意時は false と null を返す", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-not-consented",
    });
    const existingDoc: Doc = {
      _id: "doc-not-consented",
      _creationTime: 1000,
      userId: "https://issuer.example|user-not-consented",
      displayName: "未同意ユーザー",
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createQueryCtxForUsers(identity, existingDoc);

    await expect(getReceiptImageConsentHandler(ctx)).resolves.toEqual({
      hasAcceptedExternalApiConsent: false,
      acceptedAt: null,
    });
  });

  it("同意を承認すると users に承認時刻を保存する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await acceptReceiptImageExternalApiConsentHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchCalls = (ctx.db as any).patch.mock.calls;
    expect(patchCalls[0][0]).toBe("doc-001");
    expect(patchCalls[0][1]).toMatchObject({
      receiptImageExternalApiConsentAcceptedAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });
});

describe("updateMonthlyIncome", () => {
  it("未認証時は ConvexError を throw する", async () => {
    const ctx = createMutationCtxForUpdate(null);

    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: 100000 })).rejects.toBeInstanceOf(
      ConvexError,
    );
    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: 100000 })).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("正の整数を保存できる", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await updateMonthlyIncomeHandler(ctx, { monthlyIncome: 300000 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchCalls = (ctx.db as any).patch.mock.calls;
    expect(patchCalls[0][0]).toBe("doc-001");
    expect(patchCalls[0][1]).toMatchObject({ monthlyIncome: 300000 });
  });

  it("0を保存できる", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await updateMonthlyIncomeHandler(ctx, { monthlyIncome: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchCalls = (ctx.db as any).patch.mock.calls;
    expect(patchCalls[0][1]).toMatchObject({ monthlyIncome: 0 });
  });

  it("nullで monthlyIncome を削除（undefined にパッチ）できる", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await updateMonthlyIncomeHandler(ctx, { monthlyIncome: null });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchCalls = (ctx.db as any).patch.mock.calls;
    expect(patchCalls[0][1]).toMatchObject({ monthlyIncome: undefined });
  });

  it("負の値で ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: -1 })).rejects.toBeInstanceOf(
      ConvexError,
    );
    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: -1 })).rejects.toMatchObject({
      data: "月収入は0以上の整数で入力してください",
    });
  });

  it("非整数で ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: 100.5 })).rejects.toBeInstanceOf(
      ConvexError,
    );
    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: 100.5 })).rejects.toMatchObject({
      data: "月収入は0以上の整数で入力してください",
    });
  });

  it("userが見つからない場合は ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-ghost" });
    const ctx = createMutationCtxForUpdate(identity, null);

    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: 100000 })).rejects.toBeInstanceOf(
      ConvexError,
    );
    await expect(updateMonthlyIncomeHandler(ctx, { monthlyIncome: 100000 })).rejects.toMatchObject({
      data: "User not found",
    });
  });
});

describe("updateWeeklyDays", () => {
  it("未認証時は ConvexError を throw する", async () => {
    const ctx = createMutationCtxForUpdate(null);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 0 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 0 }),
    ).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("0〜6の整数を保存できる", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await updateWeeklyDaysHandler(ctx, { weeklyStartDay: 2, weeklyEndDay: 0 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patchCalls = (ctx.db as any).patch.mock.calls;
    expect(patchCalls[0][0]).toBe("doc-001");
    expect(patchCalls[0][1]).toMatchObject({
      weeklyStartDay: 2,
      weeklyEndDay: 1,
    });
  });

  it("weeklyStartDay が負の値の場合は ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: -1, weeklyEndDay: 0 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: -1, weeklyEndDay: 0 }),
    ).rejects.toMatchObject({
      data: "週の開始曜日は0〜6の整数で入力してください",
    });
  });

  it("weeklyStartDay が7以上の場合は ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 7, weeklyEndDay: 0 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 7, weeklyEndDay: 0 }),
    ).rejects.toMatchObject({
      data: "週の開始曜日は0〜6の整数で入力してください",
    });
  });

  it("weeklyEndDay が負の値の場合は ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: -1 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: -1 }),
    ).rejects.toMatchObject({
      data: "週の終了曜日は0〜6の整数で入力してください",
    });
  });

  it("weeklyEndDay が7以上の場合は ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 7 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 7 }),
    ).rejects.toMatchObject({
      data: "週の終了曜日は0〜6の整数で入力してください",
    });
  });

  it("非整数で ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-001" });
    const ctx = createMutationCtxForUpdate(identity, BASE_DOC);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1.5, weeklyEndDay: 0 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 2.5 }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("userが見つからない場合は ConvexError を throw する", async () => {
    const identity = createIdentity({ tokenIdentifier: "https://issuer.example|user-ghost" });
    const ctx = createMutationCtxForUpdate(identity, null);

    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 0 }),
    ).rejects.toBeInstanceOf(ConvexError);
    await expect(
      updateWeeklyDaysHandler(ctx, { weeklyStartDay: 1, weeklyEndDay: 0 }),
    ).rejects.toMatchObject({
      data: "User not found",
    });
  });
});
