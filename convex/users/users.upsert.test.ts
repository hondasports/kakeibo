import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { upsertUserHandler } from "./mutations";
import { upsertUserProfileHandler } from "./internal";
import type { Doc } from "./testHelpers";
import { createIdentity, createMutationCtx } from "./testHelpers";

describe("upsertUser", () => {
  it("未認証時は ConvexError を throw する", async () => {
    const ctx = createMutationCtx(null);

    await expect(upsertUserHandler(ctx)).rejects.toBeInstanceOf(ConvexError);
    await expect(upsertUserHandler(ctx)).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });

  it("DB由来の予期しないエラーは ConvexError に変換せずそのまま再送出する", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|clerk-user-token",
    });
    const ctx = createMutationCtx(identity, null);
    const dbError = new Error("internal storage failure");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((ctx.db as any).query as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw dbError;
    });

    await expect(upsertUserHandler(ctx)).rejects.toBe(dbError);
    await expect(upsertUserHandler(ctx)).rejects.not.toBeInstanceOf(ConvexError);
  });

  it("初回ログイン時は users テーブルに新規ドキュメントを作成する", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|clerk-user-token",
      name: "テストユーザー",
      email: "test@example.com",
    });
    // existingDoc = null → insert が呼ばれるケース
    const ctx = createMutationCtx(identity, null);

    await upsertUserHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbInsert).toHaveBeenCalledWith("users", {
      userId: "https://issuer.example|clerk-user-token",
      displayName: "テストユーザー",
      email: "test@example.com",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });

    // patch は呼ばれていないこと
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).not.toHaveBeenCalled();
  });

  it("2回目以降のログイン時は既存ドキュメントを更新する（重複しない）", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|clerk-user-token",
      name: "更新後の名前",
      email: "updated@example.com",
    });
    const existingDoc: Doc = {
      _id: "existing-doc-id",
      _creationTime: 1000000,
      userId: "https://issuer.example|clerk-user-token",
      displayName: "旧名前",
      email: "old@example.com",
      createdAt: 1000000,
      updatedAt: 1000000,
    };
    // existingDoc あり → patch が呼ばれるケース
    const ctx = createMutationCtx(identity, existingDoc);

    await upsertUserHandler(ctx);

    // insert は呼ばれていないこと（重複なし）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).not.toHaveBeenCalled();

    // patch が既存ドキュメントの _id で呼ばれること
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledOnce();
    expect(dbPatch).toHaveBeenCalledWith("existing-doc-id", {
      displayName: "更新後の名前",
      email: "updated@example.com",
      updatedAt: expect.any(Number),
    });
  });

  it("identity.name がない2回目以降のログインでは既存の表示名をメールで上書きしない", async () => {
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|clerk-user-token",
      name: undefined,
      email: "updated@example.com",
    });
    const existingDoc: Doc = {
      _id: "existing-doc-id",
      _creationTime: 1000000,
      userId: "https://issuer.example|clerk-user-token",
      displayName: "招待 太郎",
      email: "old@example.com",
      createdAt: 1000000,
      updatedAt: 1000000,
    };
    const ctx = createMutationCtx(identity, existingDoc);

    await upsertUserHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith("existing-doc-id", {
      displayName: "招待 太郎",
      email: "updated@example.com",
      updatedAt: expect.any(Number),
    });
  });

  it("userId には tokenIdentifier を使い、Clerk の user_xxx 形式は使わない", async () => {
    // Clerk の subject は "user_xxx" 形式だが、tokenIdentifier を使うことを検証する
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|clerk-canonical-id",
      subject: "user_clerk_raw_id", // Clerk の生 user_xxx 形式
      email: "canonical@example.com",
    });
    const ctx = createMutationCtx(identity, null);

    await upsertUserHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    const insertedDoc = dbInsert.mock.calls[0][1] as { userId: string };

    // userId は tokenIdentifier であること
    expect(insertedDoc.userId).toBe("https://issuer.example|clerk-canonical-id");
    // Clerk の生 user_xxx 形式の subject は使われていないこと
    expect(insertedDoc.userId).not.toBe("user_clerk_raw_id");
  });

  it("name が undefined/null の場合は email を displayName に使う", async () => {
    // name なし・email あり → email が displayName になる
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-no-name",
      name: undefined,
      email: "fallback@example.com",
    });
    const ctx = createMutationCtx(identity, null);

    await upsertUserHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    const insertedDoc = dbInsert.mock.calls[0][1] as {
      displayName: string;
      email?: string;
    };

    expect(insertedDoc.displayName).toBe("fallback@example.com");
    expect(insertedDoc.email).toBe("fallback@example.com");
  });

  it("name も email も null/undefined の場合は 'ユーザー' を displayName に使う", async () => {
    // name も email もなし → "ユーザー" が displayName になる
    const identity = createIdentity({
      tokenIdentifier: "https://issuer.example|user-no-name-no-email",
      name: undefined,
      email: undefined,
    });
    const ctx = createMutationCtx(identity, null);

    await upsertUserHandler(ctx);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    const insertedDoc = dbInsert.mock.calls[0][1] as {
      displayName: string;
      email?: string;
    };

    expect(insertedDoc.displayName).toBe("ユーザー");
    expect(insertedDoc.email).toBeUndefined();
  });
});

describe("upsertUserProfile", () => {
  it("招待受け入れ時のプロフィールを users テーブルへ作成する", async () => {
    const ctx = createMutationCtx(null, null);

    await upsertUserProfileHandler(ctx, {
      userId: "https://issuer.example|invitee",
      displayName: "招待 太郎",
      email: "Invitee@Example.com",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith("users", {
      userId: "https://issuer.example|invitee",
      displayName: "招待 太郎",
      email: "invitee@example.com",
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
  });

  it("既存プロフィールがあれば表示名とメールを更新する", async () => {
    const existingDoc: Doc = {
      _id: "user-existing",
      _creationTime: 1000,
      userId: "https://issuer.example|invitee",
      displayName: "旧表示名",
      email: "old@example.com",
      createdAt: 1000,
      updatedAt: 1000,
    };
    const ctx = createMutationCtx(null, existingDoc);

    await upsertUserProfileHandler(ctx, {
      userId: "https://issuer.example|invitee",
      displayName: "新表示名",
      email: "new@example.com",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith("user-existing", {
      displayName: "新表示名",
      email: "new@example.com",
      updatedAt: expect.any(Number),
    });
  });
});
