import { extractReceiptFieldsHandler } from "./extraction";
import { VALID_IMAGE_DATA_URL, createActionCtx, createIdentity, withEnv } from "./testHelpers";
import { ConvexError } from "convex/values";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("extractReceiptFieldsHandler (real)", () => {
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
      await withEnv(
        { RECEIPT_IMAGE_EXTRACTOR_MODE: undefined, APP_ENV: "production" },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
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

  describe("real モード - OpenAI API 呼び出し", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it("正常レスポンスをパースして返す", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "スーパーマーケット ABC",
                  date: "2024-03-15",
                  amountYen: 1580,
                  confidence: {
                    shopName: 0.94,
                    date: 0.96,
                    amountYen: 0.98,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          const result = await extractReceiptFieldsHandler(ctx, {
            imageDataUrl: VALID_IMAGE_DATA_URL,
          });

          expect(result).toMatchObject({
            shopName: "スーパーマーケット ABC",
            date: "2024-03-15",
            amountYen: 1580,
            confidence: {
              shopName: 0.94,
              date: 0.96,
              amountYen: 0.98,
            },
          });
        },
      );
    });

    it("OpenAI API エラー時は ConvexError を投げる", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-invalid-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("JSON パース失敗時は ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "これはJSONではない",
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("スキーマ不正なレスポンス（amountYen が文字列）は ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "ABC",
                  date: "2024-03-15",
                  amountYen: "千五百円", // number のはずが string
                  confidence: {
                    shopName: 0.7,
                    date: 0.7,
                    amountYen: 0.2,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("実在しない日付は ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "ABC",
                  date: "2024-02-31",
                  amountYen: 1500,
                  confidence: {
                    shopName: 0.7,
                    date: 0.4,
                    amountYen: 0.8,
                  },
                  warnings: ["日付が不明瞭です"],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("小数の amountYen は ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "ABC",
                  date: "2024-03-15",
                  amountYen: 123.45,
                  confidence: {
                    shopName: 0.8,
                    date: 0.8,
                    amountYen: 0.8,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("confidence が項目別スコアでないレスポンスは ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "ABC",
                  date: "2024-03-15",
                  amountYen: 1500,
                  confidence: "high",
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("confidence スコアが 0.0〜1.0 の範囲外なら ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "ABC",
                  date: "2024-03-15",
                  amountYen: 1500,
                  confidence: {
                    shopName: 0.8,
                    date: 1.2,
                    amountYen: 0.9,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("fetch 自体がネットワークエラーのとき ConvexError を投げる", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network error"));

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("コンビニ払込票のレスポンスをパースして返す", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  documentType: "convenience_payment",
                  shopName: "セブンイレブン",
                  paymentPlace: "セブンイレブン北浜店",
                  payeeName: "東京都",
                  paymentPurpose: "自動車税",
                  date: "2024-03-15",
                  amountYen: 39500,
                  categoryName: "税金",
                  confidence: {
                    documentType: 0.92,
                    shopName: 0.85,
                    paymentPlace: 0.9,
                    payeeName: 0.95,
                    paymentPurpose: 0.94,
                    date: 0.9,
                    amountYen: 0.98,
                    categoryName: 0.88,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          const result = await extractReceiptFieldsHandler(ctx, {
            imageDataUrl: VALID_IMAGE_DATA_URL,
          });

          expect(result).toMatchObject({
            documentType: "convenience_payment",
            shopName: "セブンイレブン",
            paymentPlace: "セブンイレブン北浜店",
            payeeName: "東京都",
            paymentPurpose: "自動車税",
            date: "2024-03-15",
            amountYen: 39500,
            categoryName: "税金",
            confidence: {
              documentType: 0.92,
              shopName: 0.85,
              paymentPlace: 0.9,
              payeeName: 0.95,
              paymentPurpose: 0.94,
              date: 0.9,
              amountYen: 0.98,
              categoryName: 0.88,
            },
          });
        },
      );
    });

    it("レシート明細 items をパースして返す", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  documentType: "receipt",
                  shopName: "ドラッグストアA",
                  paymentPlace: "",
                  payeeName: "",
                  paymentPurpose: "",
                  date: "2026-06-21",
                  amountYen: 1380,
                  categoryName: "日用品",
                  items: [
                    {
                      itemName: "パン",
                      printedAmountYen: 150,
                      amountBasis: "tax_included",
                      taxRatePercent: 10,
                      taxMarker: "",
                      quantity: 1,
                      unitPriceYen: 150,
                      categoryName: "食費",
                      confidence: {
                        itemName: 0.9,
                        printedAmountYen: 0.95,
                        amountBasis: 0.9,
                        taxRatePercent: 0.9,
                        categoryName: 0.8,
                      },
                      warnings: [],
                    },
                    {
                      itemName: "胃薬",
                      printedAmountYen: 980,
                      amountBasis: "tax_included",
                      taxRatePercent: 10,
                      taxMarker: "",
                      quantity: 1,
                      unitPriceYen: 980,
                      categoryName: "医療費",
                      confidence: {
                        itemName: 0.85,
                        printedAmountYen: 0.95,
                        amountBasis: 0.9,
                        taxRatePercent: 0.9,
                        categoryName: 0.82,
                      },
                      warnings: ["品名の一部が不鮮明です"],
                    },
                    {
                      itemName: "クーポン券割引",
                      printedAmountYen: -110,
                      amountBasis: "tax_included",
                      taxRatePercent: 10,
                      taxMarker: "",
                      quantity: 1,
                      unitPriceYen: -110,
                      categoryName: "医療費",
                      confidence: {
                        itemName: 0.95,
                        printedAmountYen: 0.98,
                        amountBasis: 0.9,
                        taxRatePercent: 0.9,
                        categoryName: 0.82,
                      },
                      warnings: [],
                    },
                  ],
                  taxSummaries: [],
                  confidence: {
                    documentType: 0.92,
                    shopName: 0.85,
                    paymentPlace: 0.1,
                    payeeName: 0.1,
                    paymentPurpose: 0.1,
                    date: 0.9,
                    amountYen: 0.98,
                    categoryName: 0.7,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          const result = await extractReceiptFieldsHandler(ctx, {
            imageDataUrl: VALID_IMAGE_DATA_URL,
            categories: [
              { name: "食費", description: "スーパーや小売店で購入する食品、飲料、菓子など" },
              { name: "医療費", description: "医薬品、診察、治療費など" },
              { name: "日用品", description: "洗剤、化粧品、歯科用品、衛生用品、レジ袋など" },
            ],
          });

          expect(result.items).toEqual([
            {
              itemName: "パン",
              lineType: "item",
              amountYen: 150,
              printedAmountYen: 150,
              amountBasis: "tax_included",
              taxRatePercent: 10,
              markers: [],
              taxMarker: "",
              quantity: 1,
              unitPriceYen: 150,
              categoryName: "食費",
              confidence: {
                itemName: 0.9,
                amountYen: 0.95,
                printedAmountYen: 0.95,
                amountBasis: 0.9,
                taxRatePercent: 0.9,
                categoryName: 0.8,
              },
              warnings: [],
            },
            {
              itemName: "胃薬",
              lineType: "item",
              amountYen: 980,
              printedAmountYen: 980,
              amountBasis: "tax_included",
              taxRatePercent: 10,
              markers: [],
              taxMarker: "",
              quantity: 1,
              unitPriceYen: 980,
              categoryName: "医療費",
              confidence: {
                itemName: 0.85,
                amountYen: 0.95,
                printedAmountYen: 0.95,
                amountBasis: 0.9,
                taxRatePercent: 0.9,
                categoryName: 0.82,
              },
              warnings: ["品名の一部が不鮮明です"],
            },
            {
              itemName: "クーポン券割引",
              lineType: "discount",
              amountYen: -110,
              printedAmountYen: -110,
              amountBasis: "tax_included",
              taxRatePercent: 10,
              markers: [],
              taxMarker: "",
              quantity: 1,
              unitPriceYen: -110,
              categoryName: "医療費",
              confidence: {
                itemName: 0.95,
                amountYen: 0.98,
                printedAmountYen: 0.98,
                amountBasis: 0.9,
                taxRatePercent: 0.9,
                categoryName: 0.82,
              },
              warnings: [],
            },
          ]);
          const requestBody = JSON.parse(String(fetchSpy.mock.calls.at(-1)?.[1]?.body)) as {
            text: {
              format: {
                schema: {
                  properties: {
                    items: { items: { properties: { categoryName: { enum: string[] } } } };
                  };
                };
              };
            };
          };
          expect(
            requestBody.text.format.schema.properties.items.items.properties.categoryName.enum,
          ).toEqual(["", "食費", "医療費", "日用品"]);
          const requestWithPrompt = JSON.parse(String(fetchSpy.mock.calls.at(-1)?.[1]?.body)) as {
            input?: Array<{ content?: Array<{ text?: string }> }>;
          };
          expect(requestWithPrompt.input?.[0]?.content?.[1]?.text).toContain(
            '"description":"スーパーや小売店で購入する食品、飲料、菓子など"',
          );
        },
      );
    });

    it("明細 items が多すぎるレスポンスは ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  shopName: "ABC",
                  date: "2024-03-15",
                  amountYen: 1500,
                  items: Array.from({ length: 101 }, (_, index) => ({
                    itemName: `item-${index}`,
                    amountYen: 1,
                    categoryName: "食費",
                    confidence: {
                      itemName: 0.8,
                      amountYen: 0.8,
                      categoryName: 0.8,
                    },
                    warnings: [],
                  })),
                  confidence: {
                    shopName: 0.8,
                    date: 0.8,
                    amountYen: 0.8,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });

    it("オプション confidence スコアが 0.0〜1.0 の範囲外なら ConvexError を投げる", async () => {
      const mockApiResponse = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  documentType: "convenience_payment",
                  shopName: "セブンイレブン",
                  paymentPlace: "セブンイレブン北浜店",
                  payeeName: "東京都",
                  paymentPurpose: "自動車税",
                  date: "2024-03-15",
                  amountYen: 39500,
                  categoryName: "税金",
                  confidence: {
                    documentType: 0.92,
                    shopName: 0.85,
                    paymentPlace: 1.5,
                    payeeName: 0.95,
                    paymentPurpose: 0.94,
                    date: 0.9,
                    amountYen: 0.98,
                    categoryName: 0.88,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(mockApiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await withEnv(
        {
          RECEIPT_IMAGE_EXTRACTOR_MODE: "real",
          APP_ENV: "production",
          OPENAI_API_KEY: "sk-test-key",
        },
        async () => {
          const ctx = createActionCtx(createIdentity());
          await expect(
            extractReceiptFieldsHandler(ctx, { imageDataUrl: VALID_IMAGE_DATA_URL }),
          ).rejects.toThrow(ConvexError);
        },
      );
    });
  });
});
