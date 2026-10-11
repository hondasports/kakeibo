import { describe, expect, it } from "vitest";
import {
  buildClerkInvitationParams,
  buildInvitationFallbackUrl,
  buildInvitationRedirectUrl,
  getInvitationRedirectErrorMessage,
  INVITATION_ACCEPT_PATH,
  isAllowedRedirectOrigin,
  KAKEIBO_PRODUCTION_HOSTNAME,
  parseAllowedRedirectOrigins,
} from "./clerkInvitations";

describe("isAllowedRedirectOrigin", () => {
  it("設定済み origin は許可", () => {
    const url = new URL("https://app.example.com" + INVITATION_ACCEPT_PATH);
    expect(isAllowedRedirectOrigin(url, ["https://app.example.com"])).toBe(true);
  });

  it("allowLocalhost 指定時のみ localhost は http/https 許可", () => {
    expect(
      isAllowedRedirectOrigin(new URL("http://localhost:5173" + INVITATION_ACCEPT_PATH), [], {
        allowLocalhost: true,
      }),
    ).toBe(true);
    expect(
      isAllowedRedirectOrigin(new URL("https://127.0.0.1" + INVITATION_ACCEPT_PATH), [], {
        allowLocalhost: true,
      }),
    ).toBe(true);
  });

  it("allowLocalhost が未指定または false なら localhost は拒否", () => {
    const url = new URL("http://localhost:5173" + INVITATION_ACCEPT_PATH);
    expect(isAllowedRedirectOrigin(url, [])).toBe(false);
    expect(isAllowedRedirectOrigin(url, [], { allowLocalhost: false })).toBe(false);
    expect(isAllowedRedirectOrigin(new URL("http://127.0.0.1" + INVITATION_ACCEPT_PATH), [])).toBe(
      false,
    );
  });

  it("設定済み origin に localhost があっても allowLocalhost でなければ拒否", () => {
    const configured = ["http://localhost:5173", "http://127.0.0.1:5173"];
    const localhostUrl = new URL("http://localhost:5173" + INVITATION_ACCEPT_PATH);
    const loopbackUrl = new URL("http://127.0.0.1:5173" + INVITATION_ACCEPT_PATH);
    expect(isAllowedRedirectOrigin(localhostUrl, configured)).toBe(false);
    expect(isAllowedRedirectOrigin(localhostUrl, configured, { allowLocalhost: false })).toBe(
      false,
    );
    expect(isAllowedRedirectOrigin(loopbackUrl, configured)).toBe(false);
    expect(isAllowedRedirectOrigin(loopbackUrl, configured, { allowLocalhost: false })).toBe(false);
  });

  it("設定済み origin に localhost があり allowLocalhost 指定時は許可", () => {
    const configured = ["http://localhost:5173", "http://127.0.0.1:5173"];
    const options = { allowLocalhost: true };
    expect(
      isAllowedRedirectOrigin(
        new URL("http://localhost:5173" + INVITATION_ACCEPT_PATH),
        configured,
        options,
      ),
    ).toBe(true);
    expect(
      isAllowedRedirectOrigin(
        new URL("http://127.0.0.1:5173" + INVITATION_ACCEPT_PATH),
        configured,
        options,
      ),
    ).toBe(true);
  });

  it("本番 origin は許可", () => {
    const url = new URL(`https://${KAKEIBO_PRODUCTION_HOSTNAME}` + INVITATION_ACCEPT_PATH);
    expect(isAllowedRedirectOrigin(url, [])).toBe(true);
  });

  it("本番ホスト名でも http や別ポートは拒否", () => {
    expect(
      isAllowedRedirectOrigin(
        new URL(`http://${KAKEIBO_PRODUCTION_HOSTNAME}` + INVITATION_ACCEPT_PATH),
        [],
      ),
    ).toBe(false);
    expect(
      isAllowedRedirectOrigin(
        new URL(`https://${KAKEIBO_PRODUCTION_HOSTNAME}:8443` + INVITATION_ACCEPT_PATH),
        [],
      ),
    ).toBe(false);
  });

  it("第三者が登録できる kakeibo-*.vercel.app は設定がなければ拒否", () => {
    const url = new URL("https://kakeibo-attacker.vercel.app" + INVITATION_ACCEPT_PATH);
    expect(isAllowedRedirectOrigin(url, [])).toBe(false);
    expect(
      isAllowedRedirectOrigin(url, ["https://app.example.com"], { allowLocalhost: true }),
    ).toBe(false);
  });

  it("設定済み origin と完全一致しないものは拒否", () => {
    const configured = ["https://preview.example.com"];
    expect(isAllowedRedirectOrigin(new URL("https://evil.preview.example.com/x"), configured)).toBe(
      false,
    );
    expect(isAllowedRedirectOrigin(new URL("http://preview.example.com/x"), configured)).toBe(
      false,
    );
  });

  it("無関係な origin は拒否", () => {
    const url = new URL("https://example.com" + INVITATION_ACCEPT_PATH);
    expect(isAllowedRedirectOrigin(url, [])).toBe(false);
  });
});

describe("buildInvitationRedirectUrl", () => {
  it("許可 origin に token を付与", () => {
    const result = buildInvitationRedirectUrl(
      `https://${KAKEIBO_PRODUCTION_HOSTNAME}${INVITATION_ACCEPT_PATH}`,
      "token-123",
      [],
    );
    expect(result).toEqual({
      success: true,
      redirectUrl: `https://${KAKEIBO_PRODUCTION_HOSTNAME}${INVITATION_ACCEPT_PATH}?token=token-123`,
    });
  });

  it("無効な URL は invalid_url", () => {
    const result = buildInvitationRedirectUrl("not-a-url", "token", []);
    expect(result).toEqual({ success: false, error: "invalid_url" });
  });

  it("http/https 以外は invalid_protocol", () => {
    const result = buildInvitationRedirectUrl(
      "ftp://example.com" + INVITATION_ACCEPT_PATH,
      "token",
      [],
    );
    expect(result).toEqual({ success: false, error: "invalid_protocol" });
  });

  it("パスが異なると invalid_path", () => {
    const result = buildInvitationRedirectUrl(
      `https://${KAKEIBO_PRODUCTION_HOSTNAME}/other`,
      "token",
      [],
    );
    expect(result).toEqual({ success: false, error: "invalid_path" });
  });

  it("攻撃者が登録した kakeibo-*.vercel.app は not_allowed", () => {
    const result = buildInvitationRedirectUrl(
      "https://kakeibo-attacker.vercel.app" + INVITATION_ACCEPT_PATH,
      "token",
      [],
    );
    expect(result).toEqual({ success: false, error: "not_allowed" });
  });

  it("localhost は allowLocalhost 指定時のみ許可", () => {
    const raw = "http://localhost:5173" + INVITATION_ACCEPT_PATH;
    expect(buildInvitationRedirectUrl(raw, "token", [])).toEqual({
      success: false,
      error: "not_allowed",
    });
    expect(buildInvitationRedirectUrl(raw, "token", [], { allowLocalhost: true })).toEqual({
      success: true,
      redirectUrl: `${raw}?token=token`,
    });
  });

  it("userinfo と hash は origin が許可されていても invalid_path", () => {
    expect(
      buildInvitationRedirectUrl(
        `https://user:pass@${KAKEIBO_PRODUCTION_HOSTNAME}${INVITATION_ACCEPT_PATH}`,
        "token",
        [],
      ),
    ).toEqual({ success: false, error: "invalid_path" });
    expect(
      buildInvitationRedirectUrl(
        `https://${KAKEIBO_PRODUCTION_HOSTNAME}${INVITATION_ACCEPT_PATH}#x`,
        "token",
        [],
      ),
    ).toEqual({ success: false, error: "invalid_path" });
  });

  it("許可されていない origin は not_allowed", () => {
    const result = buildInvitationRedirectUrl(
      "https://example.com" + INVITATION_ACCEPT_PATH,
      "token",
      [],
    );
    expect(result).toEqual({ success: false, error: "not_allowed" });
  });
});

describe("buildInvitationFallbackUrl", () => {
  it("token 付き URL", () => {
    expect(buildInvitationFallbackUrl("abc-123")).toBe("/group/invitations/accept?token=abc-123");
  });

  it("token なし", () => {
    expect(buildInvitationFallbackUrl(null)).toBe("/group/invitations/accept");
  });

  it("特殊文字をエンコード", () => {
    expect(buildInvitationFallbackUrl("a&b= c")).toBe(
      "/group/invitations/accept?token=a%26b%3D%20c",
    );
  });
});

describe("buildClerkInvitationParams", () => {
  it("ignoreExisting と publicMetadata を含む", () => {
    expect(buildClerkInvitationParams("a@b.com", "https://r?token=t", "g1", "t")).toEqual({
      emailAddress: "a@b.com",
      redirectUrl: "https://r?token=t",
      ignoreExisting: true,
      publicMetadata: { groupId: "g1", token: "t" },
    });
  });
});

describe("parseAllowedRedirectOrigins", () => {
  it("カンマ区切りの origin 文字列を正規化する", () => {
    const origins = parseAllowedRedirectOrigins("https://app.example.com, http://localhost:5173 ,");
    expect(origins).toEqual(["https://app.example.com", "http://localhost:5173"]);
  });

  it("空文字列は空配列を返す", () => {
    expect(parseAllowedRedirectOrigins("")).toEqual([]);
    expect(parseAllowedRedirectOrigins("   ")).toEqual([]);
  });

  it("不正な URL はエラー", () => {
    expect(() => parseAllowedRedirectOrigins("not-a-url")).toThrow(
      "INVITATION_REDIRECT_ORIGINS contains an invalid URL",
    );
  });
});

describe("getInvitationRedirectErrorMessage", () => {
  it.each([
    ["invalid_url", "招待リンクの戻り先URLが不正です"],
    ["invalid_protocol", "招待リンクの戻り先URLが不正です"],
    ["invalid_path", "招待リンクの戻り先URLが不正です"],
    ["not_allowed", "招待リンクの戻り先URLが許可されていません"],
  ] as const)("%s -> %s", (error, expected) => {
    expect(getInvitationRedirectErrorMessage(error)).toBe(expected);
  });
});
