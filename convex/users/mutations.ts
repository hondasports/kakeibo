import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAuthenticatedUserId } from "./auth";
import { createUserStore } from "../../lib/convex/users/convexUserStore";
import {
  acceptReceiptImageExternalApiConsent as acceptReceiptImageExternalApiConsentUsecase,
  updateMonthlyIncome as updateMonthlyIncomeUsecase,
  updateWeeklyDays as updateWeeklyDaysUsecase,
  upsertUser as upsertUserUsecase,
} from "../../lib/usecase/users";

function convexError(error: unknown): never {
  if (error instanceof ConvexError) throw error;
  throw new ConvexError(error instanceof Error ? error.message : "Unknown error");
}

// by_token_identifier インデックスにはConvexの仕様上unique constraintを付与できない
// 複数ドキュメントが挿入されないよう、呼び出し元で制御すること
export async function upsertUserHandler(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated");
  }

  const userId = identity.tokenIdentifier;

  try {
    await upsertUserUsecase(
      createUserStore(ctx),
      { userId, name: identity.name, email: identity.email },
      Date.now(),
    );
  } catch (error) {
    convexError(error);
  }
}

/**
 * ログイン後に呼び出す mutation。
 * Clerk identity から users テーブルを upsert する。
 * userId はクライアント引数を信用せず、サーバー側で identity.tokenIdentifier から解決する。
 */
export const upsertUser = mutation({
  args: {},
  handler: upsertUserHandler,
});

export async function acceptReceiptImageExternalApiConsentHandler(ctx: MutationCtx) {
  const userId = await requireAuthenticatedUserId(ctx);

  try {
    await acceptReceiptImageExternalApiConsentUsecase(createUserStore(ctx), userId, Date.now());
  } catch (error) {
    convexError(error);
  }
}

export const acceptReceiptImageExternalApiConsent = mutation({
  args: {},
  handler: acceptReceiptImageExternalApiConsentHandler,
});

/** updateMonthlyIncome mutation の handler ロジック（テスト用に export） */
export async function updateMonthlyIncomeHandler(
  ctx: MutationCtx,
  args: { monthlyIncome: number | null },
) {
  const userId = await requireAuthenticatedUserId(ctx);

  try {
    await updateMonthlyIncomeUsecase(createUserStore(ctx), userId, args.monthlyIncome, Date.now());
  } catch (error) {
    convexError(error);
  }
}

export const updateMonthlyIncome = mutation({
  args: {
    monthlyIncome: v.union(v.null(), v.number()),
  },
  handler: updateMonthlyIncomeHandler,
});

/** updateWeeklyDays mutation の handler ロジック（テスト用に export） */
export async function updateWeeklyDaysHandler(
  ctx: MutationCtx,
  args: { weeklyStartDay: number; weeklyEndDay: number },
) {
  const userId = await requireAuthenticatedUserId(ctx);

  try {
    await updateWeeklyDaysUsecase(
      createUserStore(ctx),
      userId,
      { weeklyStartDay: args.weeklyStartDay, weeklyEndDay: args.weeklyEndDay },
      Date.now(),
    );
  } catch (error) {
    convexError(error);
  }
}

export const updateWeeklyDays = mutation({
  args: {
    weeklyStartDay: v.number(),
    weeklyEndDay: v.number(),
  },
  handler: updateWeeklyDaysHandler,
});
