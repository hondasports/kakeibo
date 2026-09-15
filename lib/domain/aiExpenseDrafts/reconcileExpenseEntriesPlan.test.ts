import { describe, expect, it } from "vitest";
import {
  planExpenseEntryReconciliation,
  ReconcileExpenseEntriesDomainError,
} from "./reconcileExpenseEntriesPlan";

const baseArgs = {
  draftId: "draft-1",
  draftDate: "2026-01-10",
  groupId: "group-1",
  userId: "user-1",
  now: 100,
};

describe("planExpenseEntryReconciliation", () => {
  it("既存が100件を超えるとドメインエラーを投げる", () => {
    const existing = Array.from({ length: 101 }, (_, i) => ({ _id: `e${i}` }));
    expect(() => planExpenseEntryReconciliation({ ...baseArgs, existing, items: [] })).toThrowError(
      new ReconcileExpenseEntriesDomainError("Too many expense entries are linked to this draft"),
    );
  });

  it("カテゴリ一致の既存エントリを優先して再利用しpatchフィールドを構築する", () => {
    const plan = planExpenseEntryReconciliation({
      ...baseArgs,
      existing: [
        { _id: "e-other", categoryId: "cat-x" },
        { _id: "e-food", categoryId: "cat-food" },
      ],
      items: [{ itemName: "牛乳", amountYen: 300, categoryId: "cat-food" }],
    });
    expect(plan.ops).toHaveLength(1);
    const op = plan.ops[0];
    expect(op.kind).toBe("patch");
    if (op.kind !== "patch") return;
    expect(op.entryId).toBe("e-food");
    expect(op.fields).toEqual({
      date: "2026-01-10",
      amount: 300,
      categoryId: "cat-food",
      title: "牛乳",
      entryType: "expense",
      source: "ai_suggested",
      updatedAt: 100,
    });
    expect("memo" in op.fields).toBe(false);
    expect(plan.deleteIds).toEqual(["e-other"]);
  });

  it("カテゴリ不一致なら未保持の先頭エントリを再利用する", () => {
    const plan = planExpenseEntryReconciliation({
      ...baseArgs,
      existing: [
        { _id: "e-1", categoryId: "cat-x" },
        { _id: "e-2", categoryId: "cat-y" },
      ],
      items: [
        { itemName: "A", amountYen: 100, categoryId: "cat-new" },
        { itemName: "B", amountYen: 200, categoryId: "cat-new" },
      ],
    });
    expect(plan.ops.map((op) => (op.kind === "patch" ? op.entryId : "insert"))).toEqual([
      "e-1",
      "e-2",
    ]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("memoUpdate 指定時は patch に memo キーを含め value undefined でも含む", () => {
    const plan = planExpenseEntryReconciliation({
      ...baseArgs,
      existing: [{ _id: "e-1" }],
      items: [{ itemName: "A", amountYen: 100, categoryId: "cat-1" }],
      memoUpdate: { value: undefined },
    });
    const op = plan.ops[0];
    if (op.kind !== "patch") throw new Error("expected patch");
    expect("memo" in op.fields).toBe(true);
    expect(op.fields.memo).toBeUndefined();
  });

  it("insert は memoUpdate.value が undefined なら memo キーを含めない", () => {
    const plan = planExpenseEntryReconciliation({
      ...baseArgs,
      existing: [],
      items: [{ itemName: "A", amountYen: 100, categoryId: "cat-1" }],
      memoUpdate: { value: undefined },
    });
    const op = plan.ops[0];
    if (op.kind !== "insert") throw new Error("expected insert");
    expect("memo" in op.fields).toBe(false);
    expect(op.fields).toMatchObject({
      groupId: "group-1",
      createdByUserId: "user-1",
      aiExpenseDraftId: "draft-1",
      entryType: "expense",
      source: "ai_suggested",
      createdAt: 100,
      updatedAt: 100,
    });
  });

  it("insert は memoUpdate.value 指定時に memo キーを含める", () => {
    const plan = planExpenseEntryReconciliation({
      ...baseArgs,
      existing: [],
      items: [{ itemName: "A", amountYen: 100, categoryId: "cat-1" }],
      memoUpdate: { value: "メモ" },
    });
    const op = plan.ops[0];
    if (op.kind !== "insert") throw new Error("expected insert");
    expect(op.fields.memo).toBe("メモ");
  });

  it("再利用されなかった既存エントリのみ削除対象になる", () => {
    const plan = planExpenseEntryReconciliation({
      ...baseArgs,
      existing: [
        { _id: "keep", categoryId: "cat-1" },
        { _id: "drop-1", categoryId: "cat-x" },
        { _id: "drop-2" },
      ],
      items: [
        { itemName: "A", amountYen: 100, categoryId: "cat-1" },
        { itemName: "B", amountYen: 200, categoryId: "cat-2" },
      ],
    });
    // 2件目はカテゴリ不一致のため未保持先頭 drop-1 を再利用
    expect(plan.ops.map((op) => op.kind)).toEqual(["patch", "patch"]);
    expect(plan.deleteIds).toEqual(["drop-2"]);
  });
});
