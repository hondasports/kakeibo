import { ConvexError } from "convex/values";

/**
 * endpoint 共通のドメインエラー変換。
 * ドメインエラーだけを endpoint 契約の ConvexError へ変換する。
 * DB・アダプタ由来の予期しないエラーはそのまま再送出し、メッセージを露出させない。
 */
export function toConvexEndpointError(
  error: unknown,
  domainErrors: readonly (new (...args: never[]) => Error)[],
): never {
  if (error instanceof ConvexError) throw error;
  if (domainErrors.some((DomainError) => error instanceof DomainError)) {
    throw new ConvexError((error as Error).message);
  }
  throw error;
}
