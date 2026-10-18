import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { renderWithProviders } from "../../../test/render";
import { ReceiptForm } from "./ReceiptForm";

const {
  createReceiptMock,
  registerReadyDraftsMock,
  extractReceiptFieldsMock,
  acceptReceiptImageConsentMock,
  receiptImageConsentQueryMock,
  aiExpenseDraftsByStatusQueryMock,
} = vi.hoisted(() => ({
  createReceiptMock: vi.fn(),
  registerReadyDraftsMock: vi.fn(),
  extractReceiptFieldsMock: vi.fn(),
  acceptReceiptImageConsentMock: vi.fn(),
  receiptImageConsentQueryMock: vi.fn(),
  aiExpenseDraftsByStatusQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    receipts: {
      crud: {
        createReceipt: "receipts.crud.createReceipt",
      },
    },
    aiExpenseDrafts: {
      mutations: {
        deleteDraft: "aiExpenseDrafts.mutations.deleteDraft",
        registerReadyDrafts: "aiExpenseDrafts.mutations.registerReadyDrafts",
      },
      queries: {
        listByStatus: "aiExpenseDrafts.queries.listByStatus",
        listByStatusPaginated: "aiExpenseDrafts.queries.listByStatusPaginated",
      },
    },
    users: {
      mutations: {
        acceptReceiptImageExternalApiConsent:
          "users.mutations.acceptReceiptImageExternalApiConsent",
      },
      queries: {
        getReceiptImageConsent: "users.queries.getReceiptImageConsent",
      },
    },
    receiptImageExtraction: {
      extraction: {
        extractReceiptFields: "receiptImageExtraction.extraction.extractReceiptFields",
      },
    },
    receiptAnalysisJobs: {
      queries: {
        listJobs: "receiptAnalysisJobs.queries.listJobs",
      },
      mutations: {
        createBatch: "receiptAnalysisJobs.mutations.createBatch",
        retryImageJob: "receiptAnalysisJobs.mutations.retryImageJob",
        cancelImageJob: "receiptAnalysisJobs.mutations.cancelImageJob",
      },
      actions: {
        analyzeImageJob: "receiptAnalysisJobs.actions.analyzeImageJob",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (functionRef: string) => {
    if (functionRef === "users.mutations.acceptReceiptImageExternalApiConsent") {
      return acceptReceiptImageConsentMock;
    }
    if (functionRef === "aiExpenseDrafts.mutations.registerReadyDrafts") {
      return registerReadyDraftsMock;
    }
    if (functionRef === "aiExpenseDrafts.mutations.deleteDraft") {
      return vi.fn().mockResolvedValue({ deleted: true });
    }
    if (functionRef === "receiptAnalysisJobs.mutations.createBatch") {
      return vi.fn().mockResolvedValue({ batch: { _id: "batch-1" }, jobs: [] });
    }
    if (functionRef === "receiptAnalysisJobs.mutations.retryImageJob") {
      return vi.fn().mockResolvedValue(undefined);
    }
    if (functionRef === "receiptAnalysisJobs.mutations.cancelImageJob") {
      return vi.fn().mockResolvedValue(undefined);
    }
    return createReceiptMock;
  },
  useAction: (functionRef: string) => {
    if (functionRef === "receiptAnalysisJobs.actions.analyzeImageJob") {
      return vi.fn().mockResolvedValue(undefined);
    }
    return extractReceiptFieldsMock;
  },
  useQuery: (functionRef: string, args?: unknown) => {
    if (functionRef === "users.queries.getReceiptImageConsent") {
      return receiptImageConsentQueryMock();
    }
    if (functionRef === "aiExpenseDrafts.queries.listByStatus") {
      return aiExpenseDraftsByStatusQueryMock(args);
    }
    if (functionRef === "receiptAnalysisJobs.queries.listJobs") {
      return [];
    }
    return undefined;
  },
  usePaginatedQuery: (functionRef: string, args?: unknown) => ({
    results:
      functionRef === "aiExpenseDrafts.queries.listByStatusPaginated"
        ? (aiExpenseDraftsByStatusQueryMock(args) ?? [])
        : [],
    status: "Exhausted",
    loadMore: vi.fn(),
    isLoading: false,
  }),
  useConvex: () => ({
    query: vi.fn().mockResolvedValue(null),
  }),
}));

const categories = [
  { _id: "cat-food" as Id<"categories">, name: "食費", color: "#AAB7C4" },
  { _id: "cat-daily" as Id<"categories">, name: "日用品", color: "#A6B28B" },
];

describe("ReceiptForm", () => {
  beforeEach(() => {
    createReceiptMock.mockReset();
    createReceiptMock.mockResolvedValue(undefined);
    registerReadyDraftsMock.mockReset();
    registerReadyDraftsMock.mockResolvedValue(undefined);
    extractReceiptFieldsMock.mockReset();
    acceptReceiptImageConsentMock.mockReset();
    acceptReceiptImageConsentMock.mockResolvedValue(undefined);
    receiptImageConsentQueryMock.mockReset();
    receiptImageConsentQueryMock.mockReturnValue({
      hasAcceptedExternalApiConsent: true,
      acceptedAt: 1234567890,
    });
    aiExpenseDraftsByStatusQueryMock.mockReset();
    aiExpenseDraftsByStatusQueryMock.mockReturnValue([]);
    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue("data:image/jpeg;base64,mockBase64Data");
    extractReceiptFieldsMock.mockResolvedValue({
      shopName: "サンプルストア",
      date: "2026-05-18",
      amountYen: 1234,
      confidence: {
        shopName: 0.95,
        date: 0.98,
        amountYen: 0.98,
      },
      warnings: [],
    });
  });

  it("未入力の店舗名と金額は保存せず、バリデーションエラーを表示する", async () => {
    // Given: 週次入力フォームが初期表示されている
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );

    // When: 必須項目を空のまま保存する
    await user.click(screen.getByRole("button", { name: "保存して次へ" }));

    // Then: 保存APIは呼ばれず、入力エラーが表示される
    expect(createReceiptMock).not.toHaveBeenCalled();
    expect(await screen.findByText("店舗名は必須です")).toBeInTheDocument();
    expect(screen.getByText("金額は必須です")).toBeInTheDocument();
  });

  it("金額フィールドに数字を入力するとカンマ区切りで表示される", async () => {
    // Given: 週次入力フォームが初期表示されている
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );
    const amountInput = screen.getByLabelText("合計金額");

    // When: 7桁の金額を入力する
    await user.type(amountInput, "1234567");

    // Then: 3桁カンマ区切りで表示される
    expect(amountInput).toHaveValue("1,234,567");
  });

  it("金額フィールドに英字・記号を入力しても反映されない", async () => {
    // Given: 週次入力フォームが初期表示されている
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );
    const amountInput = screen.getByLabelText("合計金額");

    // When: 英字・記号を入力する
    await user.type(amountInput, "abc!@#");

    // Then: フィールドは空のまま
    expect(amountInput).toHaveValue("");
  });

  it("金額フィールドに数字と英字を混在入力すると数字のみが反映される", async () => {
    // Given: 週次入力フォームが初期表示されている
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );
    const amountInput = screen.getByLabelText("合計金額");

    // When: 数字と英字を混在入力する
    await user.type(amountInput, "1a2b3c");

    // Then: 数字のみが表示される（カンマ区切り）
    expect(amountInput).toHaveValue("123");
  });

  it("正常入力を保存し、連続入力できるように店舗名・金額・メモだけを空に戻す", async () => {
    // Given: レシート入力に必要なカテゴリと週の日付がある
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );

    // When: 店舗名、金額、カテゴリ、メモを入力して保存する
    await user.type(screen.getByLabelText("店舗名"), "スーパー北浜");
    await user.type(screen.getByLabelText("合計金額"), "4280");
    await user.click(screen.getByRole("option", { name: "日用品" }));
    await user.type(screen.getByLabelText("メモ"), "特売日");
    await user.click(screen.getByRole("button", { name: "保存して次へ" }));

    // Then: Convex mutationに正規化された値が渡り、連続入力用の状態に戻る
    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-05-18",
          shopName: "スーパー北浜",
          amountYen: 4280,
          categoryId: "cat-daily",
          memo: "特売日",
        }),
      );
    });
    expect(screen.getByLabelText("店舗名")).toHaveValue("");
    expect(screen.getByLabelText("合計金額")).toHaveValue("");
    expect(screen.getByLabelText("メモ")).toHaveValue("");
    expect(screen.getByRole("option", { name: "日用品 選択中" })).toBeInTheDocument();
    expect(screen.getByText("レシートを保存しました")).toBeInTheDocument();
  });

  it("旧の画像から入力セクションを表示せず、読み取りと手入力導線を見せる", () => {
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );

    expect(screen.queryByRole("heading", { name: "画像から入力" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "レシート入力" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存して次へ" })).toBeEnabled();
  });

  it("支出入力では画像補助がなくても店舗名・金額・カテゴリの手入力ができる", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );

    await user.type(screen.getByLabelText("店舗名"), "スーパー北浜");
    await user.type(screen.getByLabelText("合計金額"), "4280");
    await user.click(screen.getByRole("option", { name: "日用品" }));
    await user.type(screen.getByLabelText("メモ"), "特売日");
    await user.click(screen.getByRole("button", { name: "保存して次へ" }));

    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-05-18",
          shopName: "スーパー北浜",
          amountYen: 4280,
          categoryId: "cat-daily",
          memo: "特売日",
        }),
      );
    });
  });

  it("収入タブに切り替えると銀行名フィールドが表示され、店舗名フィールドが非表示になる", async () => {
    // Given: フォームが表示されている（デフォルトは支出）
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );

    // When: 収入タブをクリックする
    await user.click(screen.getByRole("tab", { name: "収入" }));

    // Then: 銀行名フィールドが表示され、店舗名フィールドが非表示になる
    expect(screen.getByLabelText("銀行名")).toBeInTheDocument();
    expect(screen.queryByLabelText("店舗名")).not.toBeInTheDocument();
  });

  it("収入: 銀行名・金額・カテゴリを入力して保存するとAPIに type:income で渡す", async () => {
    // Given: 収入タブに切り替え済み
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );
    await user.click(screen.getByRole("tab", { name: "収入" }));

    // When: 銀行名、金額、カテゴリを入力して保存する
    await user.type(screen.getByLabelText("銀行名"), "三菱UFJ銀行");
    await user.type(screen.getByLabelText("合計金額"), "200000");
    await user.click(screen.getByRole("button", { name: "保存して次へ" }));

    // Then: type:income で bankName が渡る
    await waitFor(() => {
      expect(createReceiptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "income",
          bankName: "三菱UFJ銀行",
          amountYen: 200000,
          categoryId: "cat-food",
        }),
      );
    });
    expect(screen.getByLabelText("銀行名")).toHaveValue("");
    expect(screen.getByLabelText("合計金額")).toHaveValue("");
  });

  it("収入: 銀行名が空のまま保存しようとするとエラーを表示する", async () => {
    // Given: 収入タブに切り替え済み
    const user = userEvent.setup();
    renderWithProviders(
      <ReceiptForm weekStartDate="2026-05-18" weekEndDate="2026-05-24" categories={categories} />,
    );
    await user.click(screen.getByRole("tab", { name: "収入" }));

    // When: 銀行名を入力せずに保存ボタンをクリックする
    await user.click(screen.getByRole("button", { name: "保存して次へ" }));

    // Then: 銀行名エラーが表示され、APIは呼ばれない
    expect(await screen.findByText("銀行名は必須です")).toBeInTheDocument();
    expect(createReceiptMock).not.toHaveBeenCalled();
  });
});
