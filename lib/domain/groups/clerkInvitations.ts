export const INVITATION_ACCEPT_PATH = "/group/invitations/accept";
export const KAKEIBO_PRODUCTION_HOSTNAME = "kakeibo.vercel.app";

export type InvitationRedirectError =
  | "invalid_url"
  | "invalid_protocol"
  | "invalid_path"
  | "not_allowed";

export type BuildInvitationRedirectUrlResult =
  | { success: true; redirectUrl: string }
  | { success: false; error: InvitationRedirectError };

export type InvitationRedirectOptions = {
  /** localhost / 127.0.0.1 を許可するか。APP_ENV=development の deployment だけ true にする */
  allowLocalhost?: boolean;
};

/**
 * 招待リンクの戻り先 origin を判定する。
 * 第三者が登録できるホスト名（kakeibo-*.vercel.app 等）は許可しないため、
 * 設定済み origin・本番 origin との完全一致、または開発時の localhost だけを通す。
 */
export function isAllowedRedirectOrigin(
  url: URL,
  configuredOrigins: string[],
  options: InvitationRedirectOptions = {},
): boolean {
  if (configuredOrigins.includes(url.origin)) {
    return true;
  }

  if (options.allowLocalhost) {
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocalhost && (url.protocol === "http:" || url.protocol === "https:")) {
      return true;
    }
  }

  return url.origin === `https://${KAKEIBO_PRODUCTION_HOSTNAME}`;
}

export function buildInvitationRedirectUrl(
  rawRedirectUrl: string,
  token: string,
  configuredOrigins: string[],
  options: InvitationRedirectOptions = {},
): BuildInvitationRedirectUrlResult {
  let url: URL;
  try {
    url = new URL(rawRedirectUrl);
  } catch {
    return { success: false, error: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { success: false, error: "invalid_protocol" };
  }
  if (url.username || url.password || url.hash || url.pathname !== INVITATION_ACCEPT_PATH) {
    return { success: false, error: "invalid_path" };
  }
  if (!isAllowedRedirectOrigin(url, configuredOrigins, options)) {
    return { success: false, error: "not_allowed" };
  }

  url.searchParams.set("token", token);
  return { success: true, redirectUrl: url.toString() };
}

/**
 * カンマ区切りの origin 文字列から、正規化された origin 配列を返す。
 * 不正な URL が含まれている場合は Error を投げる。
 */
export function parseAllowedRedirectOrigins(raw: string): string[] {
  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.map((origin) => {
    try {
      return new URL(origin).origin;
    } catch {
      throw new Error("INVITATION_REDIRECT_ORIGINS contains an invalid URL");
    }
  });
}

export function buildClerkInvitationParams(
  emailAddress: string,
  redirectUrl: string,
  groupId: string,
  token: string,
) {
  return {
    emailAddress,
    redirectUrl,
    ignoreExisting: true,
    publicMetadata: {
      groupId,
      token,
    },
  };
}

export function buildInvitationFallbackUrl(token: string | null): string {
  return token
    ? `${INVITATION_ACCEPT_PATH}?token=${encodeURIComponent(token)}`
    : INVITATION_ACCEPT_PATH;
}

const invitationRedirectErrorMessages: Record<InvitationRedirectError, string> = {
  invalid_url: "招待リンクの戻り先URLが不正です",
  invalid_protocol: "招待リンクの戻り先URLが不正です",
  invalid_path: "招待リンクの戻り先URLが不正です",
  not_allowed: "招待リンクの戻り先URLが許可されていません",
};

/** 招待リダイレクトエラーをユーザー向けメッセージに変換する */
export function getInvitationRedirectErrorMessage(error: InvitationRedirectError): string {
  return invitationRedirectErrorMessages[error];
}
