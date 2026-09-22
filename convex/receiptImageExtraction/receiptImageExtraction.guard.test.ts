import { extractReceiptFieldsHandler } from "./extraction";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { VALID_IMAGE_DATA_URL, createActionCtx, createIdentity, withEnv } from "./testHelpers";

describe("real モードのガード", () => {
  it("APP_ENV が production 以外のときは real モードを拒否する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "real", APP_ENV: "development" }, async () => {
      const ctx = createActionCtx(createIdentity());
      await expect(
        extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
      ).rejects.toThrow(ConvexError);
    });
  });

  it("APP_ENV が preview のときも real モードを拒否する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "real", APP_ENV: "preview" }, async () => {
      const ctx = createActionCtx(createIdentity());
      await expect(
        extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
      ).rejects.toThrow(ConvexError);
    });
  });

  it("OPENAI_API_KEY 未設定のときは real モードでエラーを返す", async () => {
    await withEnv(
      { RECEIPT_IMAGE_EXTRACTOR_MODE: "real", APP_ENV: "production", OPENAI_API_KEY: undefined },
      async () => {
        const ctx = createActionCtx(createIdentity());
        await expect(
          extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
        ).rejects.toThrow(ConvexError);
      },
    );
  });

  it("production で mode 未設定の場合は拒否する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: undefined, APP_ENV: "production" }, async () => {
      const ctx = createActionCtx(createIdentity());
      await expect(
        extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
      ).rejects.toThrow(ConvexError);
    });
  });

  it("mode が mock / real 以外の場合は拒否する", async () => {
    await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "moc", APP_ENV: "development" }, async () => {
      const ctx = createActionCtx(createIdentity());
      await expect(
        extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
      ).rejects.toThrow(ConvexError);
    });
  });
});
