export type ExtractorMode = "mock" | "real";

import { APP_ENV_INVALID_MESSAGE, parseKnownAppEnv } from "../common/appEnv";

export type ResolveExtractorModeError = "missing_required" | "invalid" | "invalid_app_env";

const extractorModeErrorMessages: Record<ResolveExtractorModeError, string> = {
  missing_required: "RECEIPT_IMAGE_EXTRACTOR_MODE を production では必ず設定してください",
  invalid: "RECEIPT_IMAGE_EXTRACTOR_MODE は mock または real のどちらかを指定してください",
  invalid_app_env: APP_ENV_INVALID_MESSAGE,
};

/** レシート画像抽出モード解決エラーをユーザー向けメッセージに変換する */
export function getResolveExtractorModeErrorMessage(error: ResolveExtractorModeError): string {
  return extractorModeErrorMessages[error];
}

export function resolveExtractorMode(args: {
  appEnv: string | undefined;
  mode?: string;
}): { mode: ExtractorMode } | { error: ResolveExtractorModeError } {
  // APP_ENV が未設定・未知値のまま mock に落とさない（本番での偽データ生成を防ぐ）
  const appEnv = parseKnownAppEnv(args.appEnv);
  if (appEnv === undefined) {
    return { error: "invalid_app_env" };
  }

  if (args.mode === undefined || args.mode === "") {
    if (appEnv === "production") {
      return { error: "missing_required" };
    }
    return { mode: "mock" };
  }

  if (args.mode !== "mock" && args.mode !== "real") {
    return { error: "invalid" };
  }

  return { mode: args.mode };
}
