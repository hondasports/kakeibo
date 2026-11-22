/**
 * Clerk のエラーオブジェクトからユーザー向けメッセージを取得する。
 * errors[0].longMessage → errors[0].message → fallbackMessage の優先順で返す。
 * `options.userFacingOnly` を true にすると生メッセージをユーザーに見せず、
 * 開発環境のみ raw メッセージを返し、それ以外では fallbackMessage を返す。
 */
export function getClerkErrorMessage(
  error: unknown,
  fallbackMessage: string,
  options?: { userFacingOnly?: boolean },
): string {
  if (error == null) return fallbackMessage;
  if (options?.userFacingOnly && !import.meta.env.DEV) return fallbackMessage;
  const clerkError = error as {
    errors?: Array<{ longMessage?: string; message?: string }>;
  };
  return clerkError.errors?.[0]?.longMessage ?? clerkError.errors?.[0]?.message ?? fallbackMessage;
}
