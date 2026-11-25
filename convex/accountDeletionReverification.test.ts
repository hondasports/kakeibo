import { createSign, generateKeyPairSync } from "node:crypto";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import * as accountDeletionModule from "./accountDeletion";
import * as accountDeletionActionsModule from "./accountDeletionActions";
import { handleRequestAccountDeletion } from "./accountDeletionActions";
import { createClerkSessionTokenVerifier } from "../lib/convex/accountDeletion/clerkSessionTokenVerifier";

const ISSUER = "https://issuer.example.test";
const SUBJECT = "user_2reverification";
const TOKEN_IDENTIFIER = `${ISSUER}|${SUBJECT}`;
const REAUTHENTICATION_FAILED_CODE = "ACCOUNT_DELETION_REAUTHENTICATION_FAILED";
const STRICT_REVERIFICATION_HINT = {
  clerk_error: {
    type: "forbidden",
    reason: "reverification-error",
    metadata: { reverification: "strict" },
  },
};

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

type JwtInput = {
  iss?: string;
  sub?: string;
  sid?: unknown;
  fva?: unknown;
  iat?: unknown;
  expiresInSeconds?: number;
  issuedAtSecondsAgo?: number;
};

function base64Url(value: string | Buffer): string {
  return Buffer.isBuffer(value)
    ? value.toString("base64url")
    : Buffer.from(value).toString("base64url");
}

function signJwt(input: JwtInput = {}, signingKey: typeof privateKey = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const { expiresInSeconds = 300, issuedAtSecondsAgo = 0, ...claimOverrides } = input;
  const payload = {
    iss: ISSUER,
    sub: SUBJECT,
    sid: "sess_reverification_test",
    iat: now - issuedAtSecondsAgo,
    exp: now + expiresInSeconds,
    fva: [0, -1],
    ...claimOverrides,
  };
  const header: Record<string, unknown> = { alg: "RS256", typ: "JWT", kid: "test-key" };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(signingKey);
  return `${unsigned}.${base64Url(signature)}`;
}

function createIdentity() {
  return {
    tokenIdentifier: TOKEN_IDENTIFIER,
    subject: SUBJECT,
    issuer: ISSUER,
    email: "user@example.com",
  };
}

function createCtx(identity: ReturnType<typeof createIdentity> | null = createIdentity()) {
  const runMutation = vi.fn(async () => "account-deletion-request-id");
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => identity) },
    runMutation,
  } as unknown as Parameters<typeof handleRequestAccountDeletion>[0];
  return { ctx, runMutation };
}

function createVerifier() {
  return createClerkSessionTokenVerifier({
    secretKey: "sk_test_dummy",
    jwtKey: publicKeyPem,
  });
}

async function runHandlerWithToken(token: string) {
  const { ctx, runMutation } = createCtx();
  const result = await handleRequestAccountDeletion(
    ctx,
    { confirmationText: "削除", sessionToken: token },
    { sessionTokenVerifier: createVerifier() },
  );
  return { result, runMutation };
}

function expectReauthenticationRejection(thrown: unknown, token?: string) {
  expect(thrown).toBeInstanceOf(ConvexError);
  expect((thrown as ConvexError<{ code: string }>).data).toEqual({
    code: REAUTHENTICATION_FAILED_CODE,
  });
  expect(String(thrown)).not.toContain("sensitive verifier detail");
  if (token !== undefined && token.length > 0) expect(String(thrown)).not.toContain(token);
}

describe("handleRequestAccountDeletion", () => {
  it("検証済みsession tokenの主体・発行者がConvex identityと一致し、strictなfvaを満たすときだけ退会開始mutationを呼ぶ", async () => {
    const token = signJwt({ fva: [8, -1] });
    const { result, runMutation } = await runHandlerWithToken(token);

    expect(result).toBe("account-deletion-request-id");
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(internal.accountDeletion.requestAccountDeletion, {
      confirmationText: "削除",
      tokenIdentifier: TOKEN_IDENTIFIER,
      clerkUserId: SUBJECT,
    });
    expect(JSON.stringify(runMutation.mock.calls)).not.toContain(token);
    expect(JSON.stringify(runMutation.mock.calls)).not.toContain("sessionToken");
  });

  it("未認証なら拒否し、退会開始mutationを呼ばない", async () => {
    const { ctx, runMutation } = createCtx(null);
    await expect(
      handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: signJwt() },
        { sessionTokenVerifier: createVerifier() },
      ),
    ).rejects.toThrow("Not authenticated");
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    ["署名不正", signJwt({}, otherPrivateKey)],
    ["期限切れ", signJwt({ expiresInSeconds: -60 })],
    ["別主体", signJwt({ sub: "user_other" })],
    ["別発行者", signJwt({ iss: "https://other-issuer.example.test" })],
    ["空token", ""],
    ["不正な形式", "not-a-jwt"],
    ["iatが許容を超える未来", signJwt({ iat: Math.floor(Date.now() / 1000) + 60 })],
  ])("%sのtokenは再認証応答ではなく拒否し、退会開始mutationを呼ばない", async (_label, token) => {
    const { ctx, runMutation } = createCtx();
    let thrown: unknown;
    try {
      await handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: token },
        { sessionTokenVerifier: createVerifier() },
      );
    } catch (error) {
      thrown = error;
    }
    expectReauthenticationRejection(thrown, token);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "sid欠落"],
    ["", "sid空文字"],
    [123, "sid非文字列"],
  ])("%sのtokenはsession tokenとみなさず拒否する（%s）", async (sid) => {
    const token = signJwt({ sid });
    const { ctx, runMutation } = createCtx();
    let thrown: unknown;
    try {
      await handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: token },
        { sessionTokenVerifier: createVerifier() },
      );
    } catch (error) {
      thrown = error;
    }
    expectReauthenticationRejection(thrown, token);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("iatが11分前の長寿命tokenは、発行時fvaが0でも再認証を求め、退会開始mutationを呼ばない", async () => {
    const { result, runMutation } = await runHandlerWithToken(
      signJwt({ fva: [0, -1], expiresInSeconds: 3600, issuedAtSecondsAgo: 660 }),
    );

    expect(result).toEqual(STRICT_REVERIFICATION_HINT);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    [[8, -1], true, "第一要素8分"],
    [[9, -1], false, "第一要素9分に発行後経過時間が加わる"],
    [[10, -1], false, "第一要素10分ちょうど"],
    [[11, -1], false, "第一要素11分"],
    [[-1, -1], false, "第一・第二要素ともなし"],
    [[0, 8], true, "第二要素8分"],
    [[0, 9], false, "第二要素9分に発行後経過時間が加わる"],
    [[0, 10], false, "第二要素10分ちょうど"],
    [[-1, 8], true, "第一要素なし・第二要素8分"],
  ])("fva=%s のときstrict判定は %s（%s）", async (fva, startsDeletion) => {
    const { result, runMutation } = await runHandlerWithToken(signJwt({ fva }));

    if (startsDeletion) {
      expect(result).toBe("account-deletion-request-id");
      expect(runMutation).toHaveBeenCalledTimes(1);
    } else {
      expect(result).toEqual(STRICT_REVERIFICATION_HINT);
      expect(runMutation).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["fva claimなし", signJwt({ fva: undefined })],
    ["fva形式不正", signJwt({ fva: [-2, -1] })],
    ["iat claimなし", signJwt({ iat: undefined })],
    ["iat形式不正", signJwt({ iat: "not-a-number" })],
  ])("%sのtokenは再認証応答ではなく拒否し、退会開始mutationを呼ばない", async (_label, token) => {
    const { ctx, runMutation } = createCtx();
    let thrown: unknown;
    try {
      await handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: token },
        { sessionTokenVerifier: createVerifier() },
      );
    } catch (error) {
      thrown = error;
    }
    expectReauthenticationRejection(thrown, token);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("CLERK_SECRET_KEYがなければ署名済みtokenでも拒否し、退会開始mutationを呼ばない", async () => {
    const { ctx, runMutation } = createCtx();
    const verifier = createClerkSessionTokenVerifier({
      secretKey: undefined,
      jwtKey: publicKeyPem,
    });

    await expect(
      handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: signJwt() },
        { sessionTokenVerifier: verifier },
      ),
    ).rejects.toMatchObject({ data: { code: REAUTHENTICATION_FAILED_CODE } });
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("token検証portが例外を返しても詳細をクライアントへ返さず拒否する", async () => {
    const token = signJwt();
    const { ctx, runMutation } = createCtx();
    const verifier = {
      verify: vi.fn(async () => {
        throw new Error(`sensitive verifier detail ${token}`);
      }),
    };

    let thrown: unknown;
    try {
      await handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: token },
        { sessionTokenVerifier: verifier },
      );
    } catch (error) {
      thrown = error;
    }

    expectReauthenticationRejection(thrown, token);
    expect(runMutation).not.toHaveBeenCalled();
  });
});

describe("createClerkSessionTokenVerifier", () => {
  it("test内で生成した鍵のjwtKeyを使い、本物のverifyTokenでRS256署名を検証する", async () => {
    const verifier = createVerifier();
    await expect(verifier.verify(signJwt())).resolves.toMatchObject({
      kind: "verified",
      claims: { iss: ISSUER, sub: SUBJECT },
    });
  });

  it("CLERK_SECRET_KEY相当のsecretKeyがなければjwtKeyがあっても検証しない", async () => {
    const verifier = createClerkSessionTokenVerifier({
      secretKey: undefined,
      jwtKey: publicKeyPem,
    });
    await expect(verifier.verify(signJwt())).resolves.toEqual({ kind: "invalid" });
  });
});

describe("退会開始の公開関数棚卸し", () => {
  type RegisteredFunctionLike = {
    isPublic?: boolean;
    isMutation?: boolean;
    isAction?: boolean;
  };

  function publicWriteExportNames(module: object): string[] {
    return Object.entries(module as Record<string, unknown>)
      .filter(([, value]) => {
        const registered = value as RegisteredFunctionLike | undefined;
        return (
          registered?.isPublic === true &&
          (registered.isMutation === true || registered.isAction === true)
        );
      })
      .map(([name]) => name)
      .sort();
  }

  it("公開actionはconfirmationTextとsessionTokenを必須引数にする", () => {
    const registered = accountDeletionActionsModule.requestAccountDeletion as unknown as {
      exportArgs: () => string;
    };
    const argsSchema = JSON.parse(registered.exportArgs()) as {
      value: Record<string, { optional: boolean }>;
    };
    expect(argsSchema.value.confirmationText.optional).toBe(false);
    expect(argsSchema.value.sessionToken.optional).toBe(false);
  });

  it("退会開始mutationはpublic APIに残らず、公開writeはretryと再認証actionだけになる", () => {
    expect(
      (accountDeletionModule.requestAccountDeletion as unknown as RegisteredFunctionLike)
        .isMutation,
    ).toBe(true);
    expect(
      (accountDeletionModule.requestAccountDeletion as unknown as RegisteredFunctionLike).isPublic,
    ).not.toBe(true);
    expect(
      (accountDeletionActionsModule.requestAccountDeletion as unknown as RegisteredFunctionLike)
        .isAction,
    ).toBe(true);
    expect(
      (accountDeletionActionsModule.requestAccountDeletion as unknown as RegisteredFunctionLike)
        .isPublic,
    ).toBe(true);
    expect(publicWriteExportNames(accountDeletionModule)).toEqual(["retryAccountDeletion"]);
    expect(publicWriteExportNames(accountDeletionActionsModule)).toEqual([
      "requestAccountDeletion",
    ]);
  });
});
