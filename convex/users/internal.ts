import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { createUserReader, createUserStore } from "../../lib/convex/users/convexUserStore";
import {
  clearUserMonthlyIncome as clearUserMonthlyIncomeUsecase,
  getUserById as getUserByIdUsecase,
  getUserIdByEmail as getUserIdByEmailUsecase,
  upsertUserProfile as upsertUserProfileUsecase,
} from "../../lib/usecase/users";

type UpsertUserProfileArgs = {
  userId: string;
  displayName: string;
  email?: string;
};

export async function upsertUserProfileHandler(ctx: MutationCtx, args: UpsertUserProfileArgs) {
  await upsertUserProfileUsecase(createUserStore(ctx), args, Date.now());
}

export const upsertUserProfile = internalMutation({
  args: {
    userId: v.string(),
    displayName: v.string(),
    email: v.optional(v.string()),
  },
  handler: upsertUserProfileHandler,
});

export const getUserIdByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await getUserIdByEmailUsecase(createUserReader(ctx), args.email);
  },
});

export const getUserById = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await getUserByIdUsecase(createUserReader(ctx), userId);
  },
});

export const clearUserMonthlyIncome = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await clearUserMonthlyIncomeUsecase(createUserStore(ctx), userId, Date.now());
  },
});
