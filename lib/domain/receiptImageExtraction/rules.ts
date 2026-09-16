/**
 * レシート画像抽出の純粋なドメインルール。
 * 環境変数の読み取りや外部 API 呼出は infrastructure 層に委ねる。
 */
import { getImageDataUrlErrorMessage, validateImageDataUrl } from "../common/imageDataUrl";
import { getResolveExtractorModeErrorMessage, resolveExtractorMode } from "./mode";

/**
 * endpoint 契約上期待されるドメインエラー。
 * presentation 層はこの型のみ ConvexError へ変換する。
 */
export class ReceiptImageExtractionDomainError extends Error {}

/** 抽出に必要な環境設定のスナップショット。呼出時に infra が読み取る。 */
export type ExtractionEnvironment = {
  appEnv: string | undefined;
  extractorMode: string | undefined;
  openAiApiKey: string | undefined;
};

export type ExtractionPlan = { kind: "mock" } | { kind: "real"; apiKey: string };

/** imageDataUrl を検証し、失敗時はドメインエラーを投げる。 */
export function assertValidImageDataUrl(imageDataUrl: string): void {
  const result = validateImageDataUrl(imageDataUrl);
  if (!result.success) {
    throw new ReceiptImageExtractionDomainError(getImageDataUrlErrorMessage(result.error));
  }
}

/**
 * 環境設定から抽出計画を決める。判定順序は既存 endpoint と同一:
 * mode 解決 → real は production 限定 → mock → OPENAI_API_KEY 必須。
 */
export function resolveExtractionPlan(env: ExtractionEnvironment): ExtractionPlan {
  const appEnv = env.appEnv ?? "development";
  const modeResult = resolveExtractorMode({ appEnv, mode: env.extractorMode });
  if ("error" in modeResult) {
    throw new ReceiptImageExtractionDomainError(
      getResolveExtractorModeErrorMessage(modeResult.error),
    );
  }

  if (modeResult.mode === "real" && appEnv !== "production") {
    throw new ReceiptImageExtractionDomainError(
      `real モードは APP_ENV=production のときのみ利用できます（現在: ${appEnv}）`,
    );
  }

  if (modeResult.mode === "mock") {
    return { kind: "mock" };
  }

  if (!env.openAiApiKey) {
    throw new ReceiptImageExtractionDomainError(
      "OPENAI_API_KEY が設定されていません。Convex Dashboard で環境変数を設定してください",
    );
  }

  return { kind: "real", apiKey: env.openAiApiKey };
}

export function assertGroupSelected<T>(group: T | null): T {
  if (group === null) {
    throw new ReceiptImageExtractionDomainError("グループを選択してください");
  }
  return group;
}

export function assertReceiptImageConsent(consent: {
  hasAcceptedExternalApiConsent: boolean;
}): void {
  if (!consent.hasAcceptedExternalApiConsent) {
    throw new ReceiptImageExtractionDomainError("Receipt image external API consent is required");
  }
}
