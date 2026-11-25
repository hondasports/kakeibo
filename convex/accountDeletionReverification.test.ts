import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import * as accountDeletionModule from "./accountDeletion";
import * as accountDeletionActionsModule from "./accountDeletionActions";
import { handleRequestAccountDeletion } from "./accountDeletionActions";
import { createClerkSessionTokenVerifier } from "../lib/convex/accountDeletion/clerkSessionTokenVerifier";

const ISSUER = "https://issuer.example.test";
const SUBJECT = "user_2reverification";
const TOKEN_IDENTIFIER = `${ISSUER}|${SUBJECT}`;
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
  fva?: unknown;
  expiresInSeconds?: number;
};

function base64Url(value: string | Buffer): string {
  return Buffer.isBuffer(value)
    ? value.toString("base64url")
    : Buffer.from(value).toString("base64url");
}

function signJwt(input: JwtInput = {}, signingKey: typeof privateKey = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const { expiresInSeconds = 300, ...claimOverrides } = input;
  const payload = {
    iss: ISSUER,
    sub: SUBJECT,
    sid: "sess_reverification_test",
    iat: now,
    exp: now + expiresInSeconds,
    fva: [0, -1],
    ...claimOverrides,
  };
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }))}.${base64Url(JSON.stringify(payload))}`;
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

describe("handleRequestAccountDeletion", () => {
  it("検証済みtokenの主体・発行者がConvex identityと一致し、strictなfvaを満たすときだけ退会開始mutationを呼ぶ", async () => {
    const token = signJwt({ fva: [9, -1] });
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
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Reauthentication could not be verified");
    if (token.length > 0) expect(String(thrown)).not.toContain(token);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it.each([
    [[9, -1], true, "第一要素9分"],
    [[10, -1], false, "第一要素10分ちょうど"],
    [[11, -1], false, "第一要素11分"],
    [[-1, -1], false, "第一・第二要素ともなし"],
    [[0, 9], true, "第二要素9分"],
    [[0, 10], false, "第二要素10分ちょうど"],
    [[0, 11], false, "第二要素11分"],
    [[-1, 9], true, "第一要素なし・第二要素9分"],
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
  ])("%sのtokenは再認証応答ではなく拒否し、退会開始mutationを呼ばない", async (_label, token) => {
    const { ctx, runMutation } = createCtx();
    await expect(
      handleRequestAccountDeletion(
        ctx,
        { confirmationText: "削除", sessionToken: token },
        { sessionTokenVerifier: createVerifier() },
      ),
    ).rejects.toThrow("Reauthentication could not be verified");
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
    ).rejects.toThrow("Reauthentication could not be verified");
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

    expect((thrown as Error).message).toBe("Reauthentication could not be verified");
    expect(String(thrown)).not.toContain("sensitive verifier detail");
    expect(String(thrown)).not.toContain(token);
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
