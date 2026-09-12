import { describe, expect, it, vi } from "vitest";
import { createExpenseEntryRepository } from "./expenseEntryRepository";

describe("expenseEntryRepository.patch", () => {
  it("categoryId 未指定の更新では patch に categoryId キーを含めない", async () => {
    // Convex の db.patch は undefined のキーをフィールド削除として扱うため、
    // 未指定キーを渡すと既存の categoryId が消える regression を防ぐ。
    const patchMock = vi.fn().mockResolvedValue(undefined);
    const repo = createExpenseEntryRepository({
      db: { patch: patchMock },
    } as never);

    await repo.patch("entry-1", { title: "昼食", updatedAt: 1000 });
    expect(patchMock.mock.calls[0][1]).toStrictEqual({
      title: "昼食",
      updatedAt: 1000,
    });
  });

  it("categoryId 指定時は patch に含める", async () => {
    const patchMock = vi.fn().mockResolvedValue(undefined);
    const repo = createExpenseEntryRepository({
      db: { patch: patchMock },
    } as never);

    await repo.patch("entry-1", { categoryId: "cat-9", updatedAt: 1000 });
    expect(patchMock.mock.calls[0][1]).toStrictEqual({
      categoryId: "cat-9",
      updatedAt: 1000,
    });
  });
});
