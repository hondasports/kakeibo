import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { requireAuthenticatedUserId } from "./auth";
import { createUserReader } from "../../lib/convex/users/convexUserStore";
import {
  getReceiptImageConsent as getReceiptImageConsentUsecase,
  getUserProfile as getUserProfileUsecase,
} from "../../lib/usecase/users";

/** getUserProfile query の handler ロジック（テスト用に export） */
export async function getUserProfileHandler(ctx: QueryCtx) {
  const userId = await requireAuthenticatedUserId(ctx);

  return await getUserProfileUsecase(createUserReader(ctx), userId);
}

export const getUserProfile = query({
  args: {},
  handler: getUserProfileHandler,
});

export const getAuthenticatedUserId = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuthenticatedUserId(ctx);
  },
});

export async function getReceiptImageConsentHandler(ctx: QueryCtx) {
  const userId = await requireAuthenticatedUserId(ctx);

  return await getReceiptImageConsentUsecase(createUserReader(ctx), userId);
}

export const getReceiptImageConsent = query({
  args: {},
  handler: getReceiptImageConsentHandler,
});
