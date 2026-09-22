import { extractReceiptFieldsHandler } from "./extraction";
import {
  OVERSIZED_IMAGE_DATA_URL,
  VALID_IMAGE_DATA_URL,
  createActionCtx,
  createIdentity,
  getTodayDateStringInJapan,
  withEnv,
} from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";

describe("extractReceiptFieldsHandler (input)", () => {
  describe("認証チェック", () => {
    it("未認証ユーザーは実行できない", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const ctx = createActionCtx(null);
        await expect(
          extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
        ).rejects.toThrow(ConvexError);
      });
    });
  });

  describe("imageDataUrl バリデーション", () => {
    it("data:image/ で始まらない場合は拒否する", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const ctx = createActionCtx(createIdentity());
        await expect(
          extractReceiptFieldsHandler(ctx, { imageDataUrl: "https://example.com/image.jpg" }),
        ).rejects.toThrow(ConvexError);
      });
    });

    it("base64 がない不正フォーマットを拒否する", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const ctx = createActionCtx(createIdentity());
        await expect(
          extractReceiptFieldsHandler(ctx, {
            imageDataUrl: "data:image/jpeg;plaintext,abc",
          }),
        ).rejects.toThrow(ConvexError);
      });
    });

    it("大きすぎる画像を拒否する", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const ctx = createActionCtx(createIdentity());
        await expect(
          extractReceiptFieldsHandler(ctx, { imageDataUrl: OVERSIZED_IMAGE_DATA_URL }),
        ).rejects.toThrow(ConvexError);
      });
    });
  });

  describe("mock モード", () => {
    it("mock モードでは OpenAI API が呼ばれずにモックデータを返す", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const ctx = createActionCtx(createIdentity());
        const result = await extractReceiptFieldsHandler(ctx, {
          imageDataUrl: VALID_IMAGE_DATA_URL,
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          shopName: expect.any(String),
          date: expect.any(String),
          amountYen: expect.any(Number),
          confidence: {
            shopName: expect.any(Number),
            date: expect.any(Number),
            amountYen: expect.any(Number),
          },
        });
        fetchSpy.mockRestore();
      });
    });

    it("mock モードの返却値に必須フィールドが含まれる", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const ctx = createActionCtx(createIdentity());
        const result = await extractReceiptFieldsHandler(ctx, {
          imageDataUrl: VALID_IMAGE_DATA_URL,
        });

        expect(result).toHaveProperty("shopName");
        expect(result).toHaveProperty("date");
        expect(result).toHaveProperty("amountYen");
        expect(result).toHaveProperty("confidence");
        expect(result).toHaveProperty("documentType");
        expect(typeof result.amountYen).toBe("number");
        // date は YYYY-MM-DD 形式
        expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it("mock モードの日付はJSTの今日を返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-06T12:00:00.000Z"));
      try {
        await withEnv(
          { RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" },
          async () => {
            const ctx = createActionCtx(createIdentity());
            const expectedDate = getTodayDateStringInJapan();
            const result = await extractReceiptFieldsHandler(ctx, {
              imageDataUrl: VALID_IMAGE_DATA_URL,
            });

            expect(result.date).toBe(expectedDate);
          },
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("mock モードでは documentType が receipt を返す", async () => {
      await withEnv({ RECEIPT_IMAGE_EXTRACTOR_MODE: "mock", APP_ENV: "development" }, async () => {
        const ctx = createActionCtx(createIdentity());
        const result = await extractReceiptFieldsHandler(ctx, {
          imageDataUrl: VALID_IMAGE_DATA_URL,
        });

        expect(result.documentType).toBe("receipt");
      });
    });
  });
});
