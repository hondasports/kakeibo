import { ConvexError } from "convex/values";

/**
 * ドメイン層が投げる Error を presentation 向けの ConvexError に変換する。
 * ドメインのエラーメッセージをそのまま data に載せる。
 */
export function toConvexError(err: unknown, fallback = "Invalid input"): ConvexError<string> {
  return new ConvexError(err instanceof Error ? err.message : fallback);
}
