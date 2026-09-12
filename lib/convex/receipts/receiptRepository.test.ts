import { describe, expect, it, vi } from "vitest";
import { createReceiptRepository } from "./receiptRepository";

describe("receiptRepository.patch", () => {
  it("categoryId 未指定の更新では patch に categoryId キーを含めない", async () => {
    // receipts.categoryId は必須のため、undefined を渡すとフィールド削除でスキーマ違反になる。
    const patchMock = vi.fn().mockResolvedValue(undefined);
    const repo = createReceiptRepository({
      db: { patch: patchMock },
    } as never);

    await repo.patch("receipt-1", { amountYen: 2000, updatedAt: 1000 });
    expect(patchMock.mock.calls[0][1]).toStrictEqual({
      amountYen: 2000,
      updatedAt: 1000,
    });
  });

  it("categoryId 指定時は patch に含める", async () => {
    const patchMock = vi.fn().mockResolvedValue(undefined);
    const repo = createReceiptRepository({
      db: { patch: patchMock },
    } as never);

    await repo.patch("receipt-1", { categoryId: "cat-9", updatedAt: 1000 });
    expect(patchMock.mock.calls[0][1]).toStrictEqual({
      categoryId: "cat-9",
      updatedAt: 1000,
    });
  });
});
