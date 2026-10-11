/**
 * デプロイ環境を表す APP_ENV の allow-list 判定。
 * mock / 開発専用の挙動は development と明示された場合だけ許可し、
 * 未設定・未知値（typo や大文字小文字違い）は production とみなさず fail-closed にする。
 */
export const KNOWN_APP_ENVS = ["development", "production"] as const;
export type KnownAppEnv = (typeof KNOWN_APP_ENVS)[number];

/** APP_ENV が未設定・不正なときのエラー文言（変数名と許容値を示す） */
export const APP_ENV_INVALID_MESSAGE =
  "APP_ENV が未設定、または不正な値です。Convex の環境変数 APP_ENV に development または production を設定してください";

/** 完全一致の allow-list で APP_ENV を解決する。未設定・未知値は undefined。 */
export function parseKnownAppEnv(value: string | undefined): KnownAppEnv | undefined {
  return KNOWN_APP_ENVS.find((known) => known === value);
}
