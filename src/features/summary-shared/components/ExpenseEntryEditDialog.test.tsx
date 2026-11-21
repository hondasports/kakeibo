import { ConvexError } from "convex/values";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseEntryEditDialog } from "./ExpenseEntryEditDialog";

const {
  updateExpenseEntryMock,
  updateReceiptMock,
  updateRegisteredDraftMock,
  useMutationMock,
  useQueryMock,
} = vi.hoisted(() => ({
  updateExpenseEntryMock: vi.fn(),
  updateReceiptMock: vi.fn(),
  updateRegisteredDraftMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({ useMutation: useMutationMock, useQuery: useQueryMock }));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    aiExpenseDrafts: {
      mutations: { updateRegisteredDraft: "updateRegisteredDraft" },
      queries: { getWithItems: "getWithItems" },
    },
    expenseEntries: { mutations: { updateExpenseEntry: "updateExpenseEntry" } },
    receipts: { crud: { updateReceipt: "updateReceipt" } },
  },
}));

/** getWithItems が返す下書きの最小形。必須の reviewReasons を欠いた形は永続化されない。 */
const savedDraft = {
  _id: "draft-1",
  status: "registered",
  documentType: "receipt",
  reviewReasons: [],
};

describe("ExpenseEntryEditDialog AI draft history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateRegisteredDraftMock.mockResolvedValue(undefined);
    useQueryMock.mockReturnValue({
      draft: savedDraft,
      items: [
        {
          _id: "item-1",
          itemName: "OCR商品",
          amountYen: 1200,
          categoryId: "cat-food",
        },
      ],
    });
    useMutationMock.mockImplementation((reference: string) => {
      if (reference === "updateRegisteredDraft") return updateRegisteredDraftMock;
      if (reference === "updateReceipt") return updateReceiptMock;
      return updateExpenseEntryMock;
    });
  });

  it("合計だけで保存した履歴は下書き専用mutationで同じ支出を更新する", async () => {
    render(
      <ExpenseEntryEditDialog
        categories={[{ _id: "cat-food", name: "食費" }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        receipt={{
          _id: "entry-1",
          date: "2026-08-26",
          type: "expense",
          shopName: "スーパー青葉",
          amountYen: 1500,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
          receiptShopName: "スーパー青葉",
          receiptTotalAmountYen: 1500,
          memo: "旧メモ",
          aiExpenseDraftId: "draft-1",
          registrationMode: "totalOnly",
        }}
      />,
    );

    expect(screen.getByRole("combobox", { name: "登録方法" })).toHaveTextContent(
      "レシート合計だけで保存",
    );
    expect(screen.getByText(/OCRの商品明細と税内訳は集計に使われません/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "1600" } });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateRegisteredDraftMock).toHaveBeenCalledWith({
        draftId: "draft-1",
        date: "2026-08-26",
        amountYen: 1600,
        categoryId: "cat-food",
        shopName: "スーパー青葉",
        memo: "",
        registrationMode: "totalOnly",
      }),
    );
    expect(updateExpenseEntryMock).not.toHaveBeenCalled();
  });

  it("登録済み下書きの明細上限エラーを表示する", async () => {
    updateRegisteredDraftMock.mockRejectedValueOnce(
      new ConvexError("Draft contains more than 100 items"),
    );
    render(
      <ExpenseEntryEditDialog
        categories={[{ _id: "cat-food", name: "食費" }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        receipt={{
          _id: "entry-1",
          date: "2026-08-26",
          type: "expense",
          shopName: "スーパー青葉",
          amountYen: 1500,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
          aiExpenseDraftId: "draft-1",
          registrationMode: "totalOnly",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText(/明細が100件を超える/)).toBeInTheDocument();
  });

  it.each([
    ["expenseEntry", "income"],
    ["expenseEntry", "expense"],
    ["receipt", "income"],
    ["receipt", "expense"],
  ] as const)(
    "%s / %s の編集で上限とフィールドエラーを共通契約に揃える",
    async (recordType, type) => {
      const onSaved = vi.fn();
      const onClose = vi.fn();
      render(
        <ExpenseEntryEditDialog
          categories={[{ _id: "cat-food", name: "食費" }]}
          onClose={onClose}
          onSaved={onSaved}
          open
          receipt={{
            _id: "entry-1",
            date: "2026-08-26",
            type,
            recordType,
            amountYen: 100,
            bankName: "給与",
            shopName: "店舗",
            categoryId: "cat-food",
            categoryName: "食費",
            categoryColor: "#f97316",
          }}
        />,
      );
      const amountInput = screen.getByLabelText("金額");
      const titleInput = screen.getByLabelText(type === "income" ? "内容" : "タイトル");
      for (const [amount, title, field, message] of [
        ["10000000", "給与", amountInput, "金額は 9,999,999 円以下です"],
        ["0", "給与", amountInput, "金額は 1 円以上です"],
        ["100", " ", titleInput, "内容は必須です"],
        ["100", "給".repeat(101), titleInput, "内容は 100 文字以内です"],
      ] as const) {
        fireEvent.change(amountInput, { target: { value: amount } });
        fireEvent.change(titleInput, { target: { value: title } });
        fireEvent.click(screen.getByRole("button", { name: "保存" }));
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText(message)).toBeInTheDocument();
        expect(updateExpenseEntryMock).not.toHaveBeenCalled();
        expect(updateReceiptMock).not.toHaveBeenCalled();
        expect(updateRegisteredDraftMock).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
      }
      fireEvent.change(amountInput, { target: { value: "9,999,999" } });
      expect(amountInput).toHaveValue("9999999");
      fireEvent.change(titleInput, { target: { value: ` ${"給".repeat(100)} ` } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      const mutation = recordType === "expenseEntry" ? updateExpenseEntryMock : updateReceiptMock;
      await waitFor(() =>
        expect(mutation).toHaveBeenCalledWith(
          expect.objectContaining({
            amountYen: 9999999,
            [recordType === "expenseEntry" ? "title" : type === "income" ? "bankName" : "shopName"]:
              "給".repeat(100),
          }),
        ),
      );
      expect(amountInput).toHaveAttribute("aria-invalid", "false");
      expect(titleInput).toHaveAttribute("aria-invalid", "false");
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

  it("履歴で保存済みOCR明細を修正してdetailedへ切り替えられる", async () => {
    render(
      <ExpenseEntryEditDialog
        categories={[{ _id: "cat-food", name: "食費" }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        receipt={{
          _id: "entry-1",
          date: "2026-08-26",
          type: "expense",
          shopName: "スーパー青葉",
          amountYen: 1500,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
          receiptShopName: "スーパー青葉",
          receiptTotalAmountYen: 1500,
          aiExpenseDraftId: "draft-1",
          registrationMode: "totalOnly",
        }}
      />,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "登録方法" }));
    fireEvent.click(screen.getByRole("option", { name: "明細ごとに保存" }));
    fireEvent.click(screen.getByRole("button", { name: "明細1を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "明細を追加" }));
    fireEvent.change(screen.getByLabelText("明細名 1"), { target: { value: "確定商品" } });
    fireEvent.change(screen.getByLabelText("明細金額 1"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateRegisteredDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationMode: "detailed",
          items: [
            {
              itemId: undefined,
              itemName: "確定商品",
              amountYen: 1500,
              categoryId: "cat-food",
            },
          ],
        }),
      ),
    );
  });

  it("detailedの通常明細では負号を保持しない", async () => {
    render(
      <ExpenseEntryEditDialog
        categories={[{ _id: "cat-food", name: "食費" }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        receipt={{
          _id: "entry-1",
          date: "2026-08-26",
          type: "expense",
          shopName: "スーパー青葉",
          amountYen: 1500,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
          receiptShopName: "スーパー青葉",
          receiptTotalAmountYen: 1500,
          aiExpenseDraftId: "draft-1",
          registrationMode: "detailed",
        }}
      />,
    );

    const amountInput = await screen.findByLabelText("明細金額 1");
    fireEvent.change(amountInput, {
      target: { value: "-100" },
    });
    expect(amountInput).toHaveValue("100");
    expect(updateRegisteredDraftMock).not.toHaveBeenCalled();
  });

  it("detailedの値引き明細は負数でも保存できる", async () => {
    useQueryMock.mockReturnValue({
      draft: savedDraft,
      items: [
        {
          _id: "item-1",
          itemName: "商品",
          amountYen: 1200,
          categoryId: "cat-food",
        },
        {
          _id: "item-2",
          itemName: "値引き",
          amountYen: -100,
          categoryId: "cat-food",
        },
      ],
    });

    render(
      <ExpenseEntryEditDialog
        categories={[{ _id: "cat-food", name: "食費" }]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        receipt={{
          _id: "entry-1",
          date: "2026-08-26",
          type: "expense",
          shopName: "スーパー青葉",
          amountYen: 1100,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
          receiptShopName: "スーパー青葉",
          receiptTotalAmountYen: 1100,
          aiExpenseDraftId: "draft-1",
          registrationMode: "detailed",
        }}
      />,
    );

    const discountAmountInput = await screen.findByLabelText("明細金額 2");
    expect(discountAmountInput).toHaveAttribute("inputmode", "text");
    fireEvent.change(discountAmountInput, { target: { value: "-150" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(updateRegisteredDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationMode: "detailed",
          items: [
            {
              itemId: "item-1",
              itemName: "商品",
              amountYen: 1200,
              categoryId: "cat-food",
            },
            {
              itemId: "item-2",
              itemName: "値引き",
              amountYen: -150,
              categoryId: "cat-food",
            },
          ],
        }),
      ),
    );
  });
  it.each([
    ["読み込んだ金額のまま", undefined, -14],
    ["負数を入力し直して", "-20", -20],
  ])(
    "detailedの行種別が割引の明細は、品名に割引の語が無くても%s保存できる",
    async (_caseName, inputAmount, expectedAmountYen) => {
      useQueryMock.mockReturnValue({
        draft: savedDraft,
        items: [
          {
            _id: "item-1",
            itemName: "商品",
            lineType: "item",
            amountYen: 179,
            categoryId: "cat-daily",
          },
          {
            _id: "item-2",
            itemName: "特売",
            lineType: "discount",
            amountYen: -14,
            categoryId: "cat-daily",
          },
        ],
      });

      render(
        <ExpenseEntryEditDialog
          categories={[{ _id: "cat-daily", name: "日用品" }]}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          open
          receipt={{
            _id: "entry-1",
            date: "2026-11-08",
            type: "expense",
            shopName: "ホームセンター",
            amountYen: 165,
            categoryId: "cat-daily",
            categoryName: "日用品",
            categoryColor: "#f97316",
            recordType: "expenseEntry",
            receiptShopName: "ホームセンター",
            receiptTotalAmountYen: 165,
            aiExpenseDraftId: "draft-1",
            registrationMode: "detailed",
          }}
        />,
      );

      const discountAmountInput = await screen.findByLabelText("明細金額 2");
      if (inputAmount !== undefined) {
        fireEvent.change(discountAmountInput, { target: { value: inputAmount } });
      }
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() =>
        expect(updateRegisteredDraftMock).toHaveBeenCalledWith(
          expect.objectContaining({
            items: [
              expect.objectContaining({ itemId: "item-1", amountYen: 179 }),
              expect.objectContaining({ itemId: "item-2", amountYen: expectedAmountYen }),
            ],
          }),
        ),
      );
    },
  );
});

describe("ExpenseEntryEditDialog 明細の合計と金額の関係", () => {
  const categories = [{ _id: "cat-food", name: "食費" }];
  const taxResolved = {
    taxRatePercent: 8,
    taxResolutionStatus: "resolved",
    taxResolutionSource: "item_explicit",
    taxAllocationStatus: "allocated",
    categoryId: "cat-food",
  };
  /** 外税レシート: 税抜の印字額 98・138・168（合計404）、税額32、支払額436。 */
  const externalItems = [
    [98, 8],
    [138, 11],
    [168, 13],
  ].map(([printed, tax], index) => ({
    ...taxResolved,
    _id: `item-${index + 1}`,
    itemName: `商品${index + 1}`,
    amountYen: printed + tax,
    printedAmountYen: printed,
    normalizedAmountYen: printed + tax,
    allocatedTaxYen: tax,
    amountBasis: "tax_excluded",
  }));
  const externalDraft = {
    ...savedDraft,
    amountYen: 436,
    categoryId: "cat-food",
    taxSummaries: [
      {
        taxRatePercent: 8,
        taxMode: "external",
        taxableAmountYen: 404,
        taxableAmountBasis: "tax_excluded",
        taxYen: 32,
        taxIncludedAmountYen: 436,
        roundingMethod: "floor",
        warnings: [],
        status: "verified",
      },
    ],
  };
  const renderDialog = (registrationMode: "detailed" | "totalOnly", amountYen: number) =>
    render(
      <ExpenseEntryEditDialog
        categories={categories}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        open
        receipt={{
          _id: "entry-1",
          date: "2026-10-04",
          type: "expense",
          shopName: "スーパー青葉",
          amountYen,
          categoryId: "cat-food",
          categoryName: "食費",
          categoryColor: "#f97316",
          recordType: "expenseEntry",
          receiptShopName: "スーパー青葉",
          receiptTotalAmountYen: amountYen,
          aiExpenseDraftId: "draft-1",
          registrationMode,
        }}
      />,
    );
  const summary = () => screen.findByRole("region", { name: "明細と金額の確認" });

  beforeEach(() => {
    vi.clearAllMocks();
    updateRegisteredDraftMock.mockResolvedValue(undefined);
    useMutationMock.mockImplementation((reference: string) =>
      reference === "updateRegisteredDraft" ? updateRegisteredDraftMock : updateExpenseEntryMock,
    );
  });

  it("外税: 税抜の明細合計と税額を足すと金額になると分かり、何も変えずに保存できる", async () => {
    useQueryMock.mockReturnValue({ draft: externalDraft, items: externalItems });
    renderDialog("detailed", 436);

    const region = within(await summary());
    expect(region.getByText("商品の金額と支払額が一致しています")).toBeInTheDocument();
    expect(region.getByText("明細合計（税抜）").nextSibling).toHaveTextContent("404円");
    expect(region.getByText("税額").nextSibling).toHaveTextContent("32円");
    expect(region.getByText("支払額").nextSibling).toHaveTextContent("436円");
    expect(region.getByText("明細の金額").nextSibling).toHaveTextContent("税抜");
    expect(screen.getByLabelText("明細金額 1")).toHaveValue("98");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(updateRegisteredDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          amountYen: 436,
          registrationMode: "detailed",
          items: externalItems.map((item) =>
            expect.objectContaining({ itemId: item._id, amountYen: item.printedAmountYen }),
          ),
        }),
      ),
    );
  });

  it("内税: 税込の明細合計が金額と一致すると分かる", async () => {
    useQueryMock.mockReturnValue({
      draft: {
        ...savedDraft,
        amountYen: 324,
        taxSummaries: [
          {
            taxRatePercent: 8,
            taxMode: "included",
            taxableAmountYen: 324,
            taxableAmountBasis: "tax_included",
            taxYen: 24,
            roundingMethod: "floor",
            warnings: [],
            status: "verified",
          },
        ],
      },
      items: [108, 216].map((amountYen, index) => ({
        ...taxResolved,
        _id: `item-${index + 1}`,
        itemName: `商品${index + 1}`,
        amountYen,
        printedAmountYen: amountYen,
        normalizedAmountYen: amountYen,
        amountBasis: "tax_included",
      })),
    });
    renderDialog("detailed", 324);

    const region = within(await summary());
    expect(region.getByText("商品の金額と支払額が一致しています")).toBeInTheDocument();
    expect(region.getByText("明細合計").nextSibling).toHaveTextContent("324円");
    expect(region.getByText("支払額").nextSibling).toHaveTextContent("324円");
    expect(region.getByText("明細の金額").nextSibling).toHaveTextContent("税込");
    expect(region.queryByText("税額")).not.toBeInTheDocument();
  });

  it("税込か税抜かが決まらない明細は、確認画面と同じ文言で比較できないと示す", async () => {
    useQueryMock.mockReturnValue({
      draft: { ...externalDraft, taxSummaries: undefined },
      items: externalItems.map((item) => ({
        ...item,
        amountBasis: "unknown",
        taxResolutionStatus: undefined,
        taxAllocationStatus: "unallocated",
        normalizedAmountYen: undefined,
      })),
    });
    renderDialog("detailed", 436);

    const region = within(await summary());
    expect(region.getByText("金額を比較できません")).toBeInTheDocument();
    expect(
      region.getByText("税設定・登録額の確認が必要な明細があるため、支払額と比較できません"),
    ).toBeInTheDocument();
    expect(region.getByText("明細合計").nextSibling).toHaveTextContent("404円");
    expect(region.getByText("明細の金額").nextSibling).toHaveTextContent("不明");
  });

  it("金額を編集すると、その場で明細との関係を判定し直す", async () => {
    useQueryMock.mockReturnValue({ draft: externalDraft, items: externalItems });
    renderDialog("detailed", 436);
    const region = within(await summary());
    expect(region.getByText("商品の金額と支払額が一致しています")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "500" } });

    expect(region.queryByText("商品の金額と支払額が一致しています")).not.toBeInTheDocument();
    expect(region.getByText("金額を比較できません")).toBeInTheDocument();
  });

  it("レシート合計だけで保存するときは表示しない", async () => {
    useQueryMock.mockReturnValue({ draft: externalDraft, items: externalItems });
    renderDialog("totalOnly", 436);

    await screen.findByRole("combobox", { name: "登録方法" });
    expect(screen.queryByRole("region", { name: "明細と金額の確認" })).not.toBeInTheDocument();
  });
});
