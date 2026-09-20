import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { theme } from "../../../theme";
import { AiExpenseQueuePanel } from "./AiExpenseQueuePanel";
import { categories, queueItems, rejectImageDecoding } from "../utils/testFixtures";

const {
  registerReadyDraftsAsExpenseEntriesMock,
  legacyRegisterReadyDraftsMock,
  updateForReviewMock,
  resetReceiptToAiInterpretationMock,
  createBatchMock,
  analyzeImageJobMock,
  retryImageJobMock,
  cancelImageJobMock,
  deleteDraftMock,
  acceptReceiptImageExternalApiConsentMock,
  useQueryMock,
} = vi.hoisted(() => ({
  registerReadyDraftsAsExpenseEntriesMock: vi.fn(),
  legacyRegisterReadyDraftsMock: vi.fn(),
  updateForReviewMock: vi.fn(),
  resetReceiptToAiInterpretationMock: vi.fn(),
  createBatchMock: vi.fn(),
  analyzeImageJobMock: vi.fn(),
  retryImageJobMock: vi.fn(),
  cancelImageJobMock: vi.fn(),
  deleteDraftMock: vi.fn(),
  acceptReceiptImageExternalApiConsentMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    aiExpenseDrafts: {
      queries: {
        getWithItems: "aiExpenseDrafts.queries.getWithItems",
        listByStatus: "aiExpenseDrafts.queries.listByStatus",
      },
      mutations: {
        registerReadyDrafts: "aiExpenseDrafts.mutations.registerReadyDrafts",
        registerReadyDraftsAsExpenseEntries:
          "aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries",
        updateForReview: "aiExpenseDrafts.mutations.updateForReview",
        resetReceiptToAiInterpretation: "aiExpenseDrafts.mutations.resetReceiptToAiInterpretation",
        deleteDraft: "aiExpenseDrafts.mutations.deleteDraft",
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
    users: {
      queries: {
        getReceiptImageConsent: "users.queries.getReceiptImageConsent",
      },
      mutations: {
        acceptReceiptImageExternalApiConsent:
          "users.mutations.acceptReceiptImageExternalApiConsent",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: string) => {
    if (reference === "aiExpenseDrafts.mutations.updateForReview") return updateForReviewMock;
    if (reference === "aiExpenseDrafts.mutations.resetReceiptToAiInterpretation") {
      return resetReceiptToAiInterpretationMock;
    }
    if (reference === "aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries") {
      return registerReadyDraftsAsExpenseEntriesMock;
    }
    if (reference === "aiExpenseDrafts.mutations.registerReadyDrafts") {
      return legacyRegisterReadyDraftsMock;
    }
    if (reference === "aiExpenseDrafts.mutations.deleteDraft") return deleteDraftMock;
    if (reference === "receiptAnalysisJobs.mutations.createBatch") return createBatchMock;
    if (reference === "receiptAnalysisJobs.mutations.retryImageJob") return retryImageJobMock;
    if (reference === "receiptAnalysisJobs.mutations.cancelImageJob") return cancelImageJobMock;
    if (reference === "users.mutations.acceptReceiptImageExternalApiConsent") {
      return acceptReceiptImageExternalApiConsentMock;
    }
    return vi.fn();
  },
  useAction: (reference: string) => {
    if (reference === "receiptAnalysisJobs.actions.analyzeImageJob") return analyzeImageJobMock;
    return vi.fn();
  },
  useQuery: (reference: string, args: unknown) => useQueryMock(reference, args),
  useConvex: () => ({
    query: vi.fn().mockResolvedValue(null),
  }),
}));

describe("AiExpenseQueuePanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.mocked(globalThis.createImageBitmap).mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    } as unknown as ImageBitmap);
    registerReadyDraftsAsExpenseEntriesMock.mockReset();
    registerReadyDraftsAsExpenseEntriesMock.mockResolvedValue(undefined);
    legacyRegisterReadyDraftsMock.mockReset();
    legacyRegisterReadyDraftsMock.mockResolvedValue(undefined);
    updateForReviewMock.mockReset();
    updateForReviewMock.mockResolvedValue({ status: "ready", reviewReasons: [] });
    resetReceiptToAiInterpretationMock.mockReset();
    resetReceiptToAiInterpretationMock.mockResolvedValue(undefined);
    createBatchMock.mockReset();
    createBatchMock.mockResolvedValue({
      batch: { _id: "batch-1" },
      jobs: [{ _id: "job-1" }, { _id: "job-2" }],
    });
    analyzeImageJobMock.mockReset();
    analyzeImageJobMock.mockResolvedValue(undefined);
    retryImageJobMock.mockReset();
    retryImageJobMock.mockResolvedValue(undefined);
    cancelImageJobMock.mockReset();
    cancelImageJobMock.mockResolvedValue(undefined);
    deleteDraftMock.mockReset();
    deleteDraftMock.mockResolvedValue({ deleted: true });
    acceptReceiptImageExternalApiConsentMock.mockReset();
    acceptReceiptImageExternalApiConsentMock.mockResolvedValue(undefined);
    useQueryMock.mockReset();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });
  });

  it("空状態では主導線と短い説明だけを表示する", () => {
    renderWithProviders(<AiExpenseQueuePanel />);

    expect(screen.getByRole("heading", { name: "レシート入力" })).toBeInTheDocument();
    expect(screen.queryByText("撮影して、あとでまとめて確認できます。")).not.toBeInTheDocument();
    expect(screen.getByText("まだ下書きはありません")).toBeInTheDocument();
    expect(
      screen.getByText("画像を解析して下書きを作成します。登録前に内容を確認できます。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("追加したレシートは状態別に表示されます。")).not.toBeInTheDocument();
    expect(screen.queryByText("レシート・払込票をまとめて追加できます。")).not.toBeInTheDocument();
    expect(
      screen.queryByText("スマートフォンでは撮影、PCでは画像選択から追加できます。"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "画像を読み取る" }).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getByRole("button", { name: "カメラで撮影" })).toBeEnabled();
    expect(screen.getByLabelText("読み取り用カメラ画像を追加")).toHaveAttribute(
      "capture",
      "environment",
    );
    expect(screen.getByRole("button", { name: "詳しい説明" })).toBeInTheDocument();
  });

  it("初期アイテムでも保存済みwarningから失敗原因を表示する", () => {
    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[
          {
            id: "draft-timeout",
            fileName: "long-receipt.jpg",
            status: "failed",
            documentType: "receipt",
            warnings: ["[receipt_extraction:timeout] response body timeout"],
          },
        ]}
      />,
    );

    expect(screen.getByText(/画像の送信がタイムアウトしました/)).toBeInTheDocument();
  });

  it("画像送信の同意状態を読み込み中は画像追加導線を無効化する", () => {
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") return undefined;
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel />);

    expect(screen.getByRole("button", { name: "カメラで撮影" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "画像を読み取る" })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByLabelText("読み取り用カメラ画像を追加")).toBeDisabled();
    expect(screen.getByLabelText("読み取り用画像を追加")).toBeDisabled();
  });

  it("複数画像を選ぶとキューへ解析待ちとして追加される", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [
          { _id: "job-1", fileName: "first-receipt.png", status: "queued" },
          { _id: "job-2", fileName: "second-payment.png", status: "queued" },
        ];
      }
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(screen.getByLabelText("読み取り用画像を追加"), [
      new File(["first"], "first-receipt.png", { type: "image/png" }),
      new File(["second"], "second-payment.png", { type: "image/png" }),
    ]);

    await waitFor(() => {
      expect(screen.getByText("first-receipt.png")).toBeInTheDocument();
      expect(screen.getByText("second-payment.png")).toBeInTheDocument();
      expect(screen.getAllByText("読み取り中", { exact: true })).toHaveLength(3);
    });

    expect(createBatchMock).toHaveBeenCalledWith({
      fileNames: ["first-receipt.png", "second-payment.png"],
    });
    expect(analyzeImageJobMock).toHaveBeenCalledTimes(2);
    expect(analyzeImageJobMock).toHaveBeenCalledWith({
      jobId: "job-1",
      imageDataUrl: "data:image/jpeg;base64,mockBase64Data",
    });
    expect(screen.queryByRole("dialog", { name: "下書き確認" })).not.toBeInTheDocument();
  });

  it("同一バッチの全画像がreadyになるまで一括登録を有効化しない", async () => {
    const user = userEvent.setup();
    let jobs: Array<{
      _id: string;
      batchId: string;
      fileName: string;
      status: string;
      draftId?: string;
    }> = [
      {
        _id: "job-1",
        batchId: "batch-1",
        fileName: "batch-first.png",
        status: "queued",
      },
      {
        _id: "job-2",
        batchId: "batch-1",
        fileName: "batch-second.png",
        status: "queued",
      },
    ];
    let readyDrafts: unknown[] = [];
    let reviewDrafts: unknown[] = [];
    let registeredDrafts: unknown[] = [];
    const firstDraft = {
      _id: "draft-batch-1",
      status: "ready",
      documentType: "receipt",
      imageFileName: "batch-first.png",
      shopName: "バッチ一店",
      amountYen: 100,
      date: "2026-06-01",
      categoryId: "cat-food",
      reviewReasons: [],
    };
    const secondDraft = {
      ...firstDraft,
      _id: "draft-batch-2",
      imageFileName: "batch-second.png",
      shopName: "バッチ二店",
      amountYen: 200,
    };

    useQueryMock.mockImplementation((reference: string, args: { status?: string }) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return jobs;
      if (reference === "aiExpenseDrafts.queries.listByStatus") {
        if (args.status === "ready") return readyDrafts;
        if (args.status === "needs_review") return reviewDrafts;
        if (args.status === "registered") return registeredDrafts;
        return [];
      }
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });

    const { rerender } = renderWithProviders(<AiExpenseQueuePanel />);
    await user.upload(screen.getByLabelText("読み取り用画像を追加"), [
      new File(["first"], "batch-first.png", { type: "image/png" }),
      new File(["second"], "batch-second.png", { type: "image/png" }),
    ]);

    expect(await screen.findByText("今回の追加 0/2件が登録準備OK")).toBeInTheDocument();
    expect(screen.getByText("解析待ち 2件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "まとめて登録（0件）" })).toBeDisabled();

    jobs = [
      { ...jobs[0], status: "ready", draftId: "draft-batch-1" },
      { ...jobs[1], status: "needs_review", draftId: "draft-batch-2" },
    ];
    readyDrafts = [firstDraft];
    reviewDrafts = [{ ...secondDraft, status: "needs_review" }];
    rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AiExpenseQueuePanel />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("今回の追加 1/2件が登録準備OK")).toBeInTheDocument();
      expect(screen.getAllByText("確認待ち 1件")).toHaveLength(2);
    });
    expect(screen.getByRole("button", { name: "まとめて登録（1件）" })).toBeDisabled();

    jobs = [{ ...jobs[0] }, { ...jobs[1], status: "ready", draftId: "draft-batch-2" }];
    readyDrafts = [firstDraft, secondDraft];
    reviewDrafts = [];
    rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AiExpenseQueuePanel />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("今回の追加 2/2件が登録準備OK")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "まとめて登録（2件）" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "まとめて登録（2件）" }));
    const confirmDialog = screen.getByRole("dialog");
    await user.click(within(confirmDialog).getByRole("button", { name: "登録する" }));

    expect(registerReadyDraftsAsExpenseEntriesMock).toHaveBeenCalledWith({
      draftIds: ["draft-batch-1", "draft-batch-2"],
    });

    jobs = jobs.map((job) => ({ ...job, status: "registered" }));
    readyDrafts = [];
    registeredDrafts = [
      { ...firstDraft, status: "registered" },
      { ...secondDraft, status: "registered" },
    ];
    rerender(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AiExpenseQueuePanel />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(screen.queryByText("今回の追加 2/2件が登録準備OK")).not.toBeInTheDocument();
    });
  });

  it("1枚だけ追加した画像の解析完了後に確認フォームを自動表示する", async () => {
    const user = userEvent.setup();
    const jobs = [
      {
        _id: "job-auto",
        fileName: "receipt.png",
        status: "needs_review",
        draftId: "draft-auto",
      },
    ];
    createBatchMock.mockResolvedValueOnce({
      batch: { _id: "batch-auto" },
      jobs: [{ _id: "job-auto" }],
    });
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return jobs;
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });
    const props = {
      categories,
      initialReviewDrafts: {
        "draft-auto": {
          _id: "draft-auto",
          status: "needs_review" as const,
          documentType: "receipt" as const,
          shopName: "スーパー青葉",
          date: "2026-06-29",
          amountYen: 1200,
          categoryId: "cat-food",
          reviewReasons: ["user_confirmation_required"],
        },
      },
    };
    renderWithProviders(<AiExpenseQueuePanel {...props} />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );
    expect(await screen.findByRole("dialog", { name: "下書き確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("支出日（レシート記載日）")).toHaveValue("2026-06-29");
  });

  it("画像送信に未同意なら同意ダイアログを表示して解析を開始しない", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: false, acceptedAt: null };
      }
      return [];
    });
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );

    expect(await screen.findByRole("dialog", { name: "画像を読み取る" })).toBeInTheDocument();
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
  });

  it("画像送信に同意すると保留した画像の解析を開始する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: false, acceptedAt: null };
      }
      return [];
    });
    createBatchMock.mockResolvedValueOnce({
      batch: { _id: "batch-consent-1" },
      jobs: [{ _id: "job-consent-1" }],
    });
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "画像を読み取る" }));

    await waitFor(() => {
      expect(acceptReceiptImageExternalApiConsentMock).toHaveBeenCalledTimes(1);
      expect(createBatchMock).toHaveBeenCalledWith({ fileNames: ["receipt.png"] });
      expect(analyzeImageJobMock).toHaveBeenCalledWith({
        jobId: "job-consent-1",
        imageDataUrl: "data:image/jpeg;base64,mockBase64Data",
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("画像送信への同意を断ると保留した画像を破棄する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: false, acceptedAt: null };
      }
      return [];
    });
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "手入力する" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(acceptReceiptImageExternalApiConsentMock).not.toHaveBeenCalled();
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
  });

  it("画像送信の同意保存に失敗したら解析せずエラーを表示する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") return [];
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: false, acceptedAt: null };
      }
      return [];
    });
    acceptReceiptImageExternalApiConsentMock.mockRejectedValueOnce(
      new Error("同意状態の保存に失敗しました"),
    );
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "画像を読み取る" }));

    expect(await screen.findByText("同意状態の保存に失敗しました")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
  });

  it("撮影導線から画像を追加してもキューへ解析待ちとして追加される", async () => {
    const user = userEvent.setup();
    createBatchMock.mockResolvedValueOnce({
      batch: { _id: "batch-camera-1" },
      jobs: [{ _id: "job-camera-1" }, { _id: "job-camera-2" }],
    });
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [{ _id: "job-camera-1", fileName: "camera-receipt.png", status: "queued" }];
      }
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(screen.getByLabelText("読み取り用カメラ画像を追加"), [
      new File(["camera"], "camera-receipt.png", { type: "image/png" }),
    ]);

    await waitFor(() => {
      expect(screen.getByText("camera-receipt.png")).toBeInTheDocument();
      expect(screen.getAllByText("読み取り中", { exact: true }).length).toBeGreaterThanOrEqual(2);
    });

    expect(createBatchMock).toHaveBeenCalledWith({
      fileNames: ["camera-receipt.png"],
    });
    expect(analyzeImageJobMock).toHaveBeenCalledWith({
      jobId: "job-camera-1",
      imageDataUrl: "data:image/jpeg;base64,mockBase64Data",
    });
  });

  it("画像追加時の読み込み失敗をUIエラーとして表示する", async () => {
    const user = userEvent.setup();
    const createImageBitmapSpy = rejectImageDecoding();
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["broken"], "broken-receipt.png", { type: "image/png" }),
    );

    expect(await screen.findByText(/画像の読み込みに失敗しました/)).toBeInTheDocument();
    expect(createBatchMock).not.toHaveBeenCalled();
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
    createImageBitmapSpy.mockRestore();
  });

  it("画像追加バッチの作成に失敗してもエラーを表示してinputをリセットする", async () => {
    const user = userEvent.setup();
    createBatchMock.mockRejectedValueOnce(new Error("画像の追加に失敗しました"));
    renderWithProviders(<AiExpenseQueuePanel />);

    const input = screen.getByLabelText("読み取り用画像を追加") as HTMLInputElement;
    await user.upload(input, new File(["receipt"], "receipt.png", { type: "image/png" }));

    expect(await screen.findByText("画像の追加に失敗しました")).toBeInTheDocument();
    expect(input.files).toHaveLength(0);
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
  });

  it("画像追加バッチを作成できなかった場合もエラーを表示する", async () => {
    const user = userEvent.setup();
    createBatchMock.mockResolvedValueOnce(undefined);
    renderWithProviders(<AiExpenseQueuePanel />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("画像の追加に失敗しました。もう一度お試しください。"),
    ).toBeInTheDocument();
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
  });

  it("状態ごとに簡潔なセクションと主操作を表示する", () => {
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} />);

    expect(screen.queryByText("読み取り中 0件")).not.toBeInTheDocument();
    expect(screen.getByText("登録できます 2件")).toBeInTheDocument();
    expect(screen.getByText("確認待ち 1件")).toBeInTheDocument();
    expect(screen.getByText("読み取り失敗 1件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認する（1件）" })).toBeEnabled();

    const readySection = screen.getByRole("region", { name: "登録できます" });
    expect(within(readySection).getByText("ok-receipt.png")).toBeInTheDocument();
    expect(within(readySection).getByText("2026/05/18 ・ 4,280円")).toBeInTheDocument();
    expect(within(readySection).getByText("registering-receipt.png")).toBeInTheDocument();
    expect(within(readySection).getByText("登録中")).toBeInTheDocument();
    expect(within(readySection).getByRole("button", { name: "登録する" })).toBeEnabled();
    expect(within(readySection).queryByRole("button", { name: "再解析" })).not.toBeInTheDocument();
    expect(within(readySection).queryByRole("button", { name: "再撮影" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "まとめて登録（1件）" })).toBeEnabled();
    expect(
      within(readySection).getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }),
    ).toBeChecked();

    const reviewSection = screen.getByRole("region", { name: "確認待ち" });
    expect(within(reviewSection).getByText("review-payment.png")).toBeInTheDocument();
    expect(within(reviewSection).getByText("必須項目不足")).toBeInTheDocument();
    expect(within(reviewSection).getByText("他1件")).toBeInTheDocument();
    expect(within(reviewSection).getByRole("button", { name: "確認する" })).toBeEnabled();
    expect(within(reviewSection).queryByRole("button", { name: "再解析" })).not.toBeInTheDocument();
    expect(within(reviewSection).queryByRole("button", { name: "再撮影" })).not.toBeInTheDocument();

    const failedSection = screen.getByRole("region", { name: "読み取り失敗" });
    expect(within(failedSection).getByText("failed-receipt.png")).toBeInTheDocument();
    expect(
      within(failedSection).getByRole("heading", { name: "読み取り失敗" }),
    ).toBeInTheDocument();
    expect(within(failedSection).getByRole("button", { name: "再撮影" })).toBeEnabled();
    expect(within(failedSection).getByRole("button", { name: "再解析" })).toBeDisabled();
    expect(
      within(failedSection).getByText(
        "明るい場所で、影や反射を避け、レシート全体を正面から撮影してください。",
      ),
    ).toBeInTheDocument();

    expect(screen.queryByRole("region", { name: "読み取り中" })).not.toBeInTheDocument();

    const registeredSection = screen.getByRole("region", { name: "登録済み" });
    expect(within(registeredSection).getByText("registered-receipt.png")).toBeInTheDocument();
    expect(
      within(registeredSection).queryByRole("button", { name: "再解析" }),
    ).not.toBeInTheDocument();
    expect(
      within(registeredSection).queryByRole("button", { name: "再撮影" }),
    ).not.toBeInTheDocument();
  });

  it("セッション中の画像をサムネイルからプレビューできる", async () => {
    const user = userEvent.setup();
    const previewImageDataUrl = "data:image/jpeg;base64,preview-image";
    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[{ ...queueItems[0], previewImageDataUrl }]} />,
    );

    const thumbnailButton = screen.getByRole("button", {
      name: "ok-receipt.pngの画像をプレビュー",
    });
    await user.click(thumbnailButton);

    const dialog = screen.getByRole("dialog", { name: "ok-receipt.pngの画像プレビュー" });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "ok-receipt.pngのレシート画像" }),
    ).toHaveAttribute("src", previewImageDataUrl);

    await user.click(within(dialog).getByRole("button", { name: "プレビューを閉じる" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "ok-receipt.pngの画像プレビュー" }),
      ).not.toBeInTheDocument();
    });
    expect(thumbnailButton).toHaveFocus();

    await user.click(thumbnailButton);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "ok-receipt.pngの画像プレビュー" }),
      ).not.toBeInTheDocument();
    });
  });

  it("画像のデコードに失敗した場合は画像なし表示へフォールバックする", () => {
    const previewImageDataUrl = "data:image/jpeg;base64,broken-image";
    const { rerender } = renderWithProviders(
      <AiExpenseQueuePanel initialItems={[{ ...queueItems[0], previewImageDataUrl }]} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "ok-receipt.pngのレシート画像" }));

    expect(screen.getByText("このセッションでは画像を表示できません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok-receipt.pngの画像をプレビュー" })).toBeDisabled();

    rerender(
      <AiExpenseQueuePanel
        initialItems={[
          { ...queueItems[0], previewImageDataUrl: "data:image/jpeg;base64,new-image" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "ok-receipt.pngの画像をプレビュー" })).toBeEnabled();
  });

  it("画像がセッションにない場合はプレースホルダーを表示する", () => {
    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[0]]} />);

    expect(screen.getByText("このセッションでは画像を表示できません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ok-receipt.pngの画像をプレビュー" })).toBeDisabled();
  });

  it("登録準備OKカードの主アクションから単体登録できる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} />);

    const readySection = screen.getByRole("region", { name: "登録できます" });
    await user.click(within(readySection).getByRole("button", { name: "登録する" }));

    expect(registerReadyDraftsAsExpenseEntriesMock).toHaveBeenCalledWith({
      draftIds: ["draft-ready"],
    });
  });

  it("登録失敗後も選択状態を保持して同じ下書きを再試行できる", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerReadyDraftsAsExpenseEntriesMock
      .mockRejectedValueOnce(new Error("登録処理に失敗しました"))
      .mockResolvedValueOnce(undefined);

    try {
      renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[0]]} />);

      const readySection = screen.getByRole("region", { name: "登録できます" });
      const registerButton = within(readySection).getByRole("button", { name: "登録する" });
      await user.click(registerButton);

      await waitFor(() => {
        expect(
          screen.getByText("登録に失敗しました。時間をおいて再度お試しください。"),
        ).toBeVisible();
      });
      expect(
        screen.getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }),
      ).toBeChecked();

      await user.click(registerButton);
      await waitFor(() => {
        expect(registerReadyDraftsAsExpenseEntriesMock).toHaveBeenCalledTimes(2);
      });
      expect(
        screen.queryByText("登録に失敗しました。時間をおいて再度お試しください。"),
      ).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("登録準備OKカードではカテゴリ別登録候補を重複表示しない", () => {
    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[
          {
            ...queueItems[0],
            amountYen: 1380,
            itemTotalYen: 1380,
            itemDifferenceYen: 0,
            categoryAggregates: [
              { categoryId: "cat-food", categoryName: "食費", amountYen: 400 },
              { categoryId: "cat-medical", categoryName: "医療費", amountYen: 980 },
            ],
          },
        ]}
      />,
    );

    const readySection = screen.getByRole("region", { name: "登録できます" });
    expect(within(readySection).queryByText(/カテゴリ別登録候補/)).not.toBeInTheDocument();
    expect(within(readySection).queryByText("食費 400円")).not.toBeInTheDocument();
    expect(within(readySection).queryByText("医療費 980円")).not.toBeInTheDocument();
  });

  it("失敗ジョブの画像を選び直して再試行できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [
          {
            _id: "job-failed",
            draftId: "draft-failed",
            fileName: "failed-receipt.png",
            status: "failed",
          },
        ];
      }
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[2]]} />);

    await user.click(screen.getByRole("button", { name: "再撮影" }));
    await user.upload(
      screen.getByLabelText("再撮影する画像を選択"),
      new File(["retry"], "failed-receipt-retry.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(retryImageJobMock).toHaveBeenCalledWith({ jobId: "job-failed" });
      expect(analyzeImageJobMock).toHaveBeenCalledWith({
        jobId: "job-failed",
        imageDataUrl: "data:image/jpeg;base64,mockBase64Data",
      });
    });
  });

  it("セッション中の同じ画像で失敗ジョブを再解析できる", async () => {
    const user = userEvent.setup();
    createBatchMock.mockResolvedValueOnce({
      batch: { _id: "batch-failed" },
      jobs: [{ _id: "job-failed" }],
    });
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [
          {
            _id: "job-failed",
            draftId: "draft-failed",
            fileName: "failed-receipt.png",
            status: "failed",
          },
        ];
      }
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[2]]} />);

    await user.upload(
      screen.getByLabelText("読み取り用画像を追加"),
      new File(["retry"], "failed-receipt.png", { type: "image/png" }),
    );
    await waitFor(() => expect(analyzeImageJobMock).toHaveBeenCalledTimes(1));
    const imageDataUrl = "data:image/jpeg;base64,mockBase64Data";
    analyzeImageJobMock.mockClear();

    await user.click(screen.getByRole("button", { name: "再解析" }));

    await waitFor(() => {
      expect(retryImageJobMock).toHaveBeenCalledWith({ jobId: "job-failed" });
      expect(analyzeImageJobMock).toHaveBeenCalledWith({
        jobId: "job-failed",
        imageDataUrl,
      });
    });
  });

  it("確認待ちの保存済み下書きを画像を選び直して再解析できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [
          {
            _id: "job-review",
            draftId: "draft-review",
            fileName: "review-payment.png",
            status: "needs_review",
          },
        ];
      }
      if (reference === "users.queries.getReceiptImageConsent") {
        return { hasAcceptedExternalApiConsent: true, acceptedAt: 1234567890 };
      }
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[1]]} />);

    await user.click(screen.getByRole("button", { name: "再解析" }));
    await user.upload(
      screen.getByLabelText("再撮影する画像を選択"),
      new File(["retry"], "review-payment-retry.png", { type: "image/png" }),
    );

    await waitFor(() => {
      expect(retryImageJobMock).toHaveBeenCalledWith({ jobId: "job-review" });
      expect(analyzeImageJobMock).toHaveBeenCalledWith({
        jobId: "job-review",
        imageDataUrl: "data:image/jpeg;base64,mockBase64Data",
      });
    });
  });

  it("失敗下書きから手入力へ戻ると一覧から削除する", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[2]]} />);

    await user.click(screen.getByRole("button", { name: "一覧から削除" }));

    await waitFor(() => {
      expect(deleteDraftMock).toHaveBeenCalledWith({ draftId: "draft-failed" });
    });
    expect(screen.queryByText("failed-receipt.png")).not.toBeInTheDocument();
  });

  it("処理中ジョブを一覧から削除できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [
          {
            _id: "job-running",
            fileName: "running-receipt.png",
            status: "running",
          },
        ];
      }
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel />);

    const processingSection = screen.getByRole("region", { name: "読み取り中" });
    await user.click(within(processingSection).getByRole("button", { name: "一覧から削除" }));

    await waitFor(() => {
      expect(cancelImageJobMock).toHaveBeenCalledWith({ jobId: "job-running" });
    });
    expect(screen.queryByText("running-receipt.png")).not.toBeInTheDocument();
  });

  it("未登録の画像をまとめてクリアできる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} />);

    await user.click(screen.getByRole("button", { name: "未登録の画像をクリア（3件）" }));

    await waitFor(() => {
      expect(deleteDraftMock).toHaveBeenCalledWith({ draftId: "draft-ready" });
      expect(deleteDraftMock).toHaveBeenCalledWith({ draftId: "draft-review" });
      expect(deleteDraftMock).toHaveBeenCalledWith({ draftId: "draft-failed" });
    });
    expect(screen.queryByText("ok-receipt.png")).not.toBeInTheDocument();
    expect(screen.queryByText("review-payment.png")).not.toBeInTheDocument();
    expect(screen.queryByText("failed-receipt.png")).not.toBeInTheDocument();
    expect(screen.getByText("registered-receipt.png")).toBeInTheDocument();
  });

  it("再試行画像の読み込み失敗をUIエラーとして表示する", async () => {
    const user = userEvent.setup();
    const createImageBitmapSpy = rejectImageDecoding();
    useQueryMock.mockImplementation((reference: string, _args: unknown) => {
      if (reference === "receiptAnalysisJobs.queries.listJobs") {
        return [
          {
            _id: "job-failed",
            draftId: "draft-failed",
            fileName: "failed-receipt.png",
            status: "failed",
          },
        ];
      }
      return [];
    });

    renderWithProviders(<AiExpenseQueuePanel initialItems={[queueItems[2]]} />);

    await user.click(screen.getByRole("button", { name: "再撮影" }));
    await user.upload(
      screen.getByLabelText("再撮影する画像を選択"),
      new File(["broken"], "failed-receipt-retry.png", { type: "image/png" }),
    );

    expect(await screen.findByText(/画像の読み込みに失敗しました/)).toBeInTheDocument();
    expect(retryImageJobMock).not.toHaveBeenCalled();
    expect(analyzeImageJobMock).not.toHaveBeenCalled();
    createImageBitmapSpy.mockRestore();
  });

  it("選択した ready 下書きだけまとめて登録する", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} />);

    await user.click(screen.getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "まとめて登録（0件）" })).toBeDisabled();
    });

    await user.click(screen.getByRole("checkbox", { name: "スーパー北浜を登録対象に含める" }));
    await user.click(screen.getByRole("button", { name: "まとめて登録（1件）" }));
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(registerReadyDraftsAsExpenseEntriesMock).toHaveBeenCalledWith({
      draftIds: ["draft-ready"],
    });
  });

  it("確認が必要な下書きを編集して登録準備OKへ戻す", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "",
          paymentPlace: "",
          payeeName: "スーパー青葉",
          paymentPurpose: "",
          date: "2026-06-01",
          amountYen: 9120,
          categoryId: "cat-daily",
          reviewReasons: ["low_confidence", "missing_required_field"],
          warnings: ["店名が読み取れませんでした"],
        },
        items: [],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    expect(screen.getByRole("heading", { name: "下書き確認" })).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(
      within(within(dialog).getByRole("region", { name: "全体の確認状態" })).getByText(
        /レシート全体の読み取り確認です/,
      ),
    ).toBeVisible();

    expect(within(dialog).queryByLabelText("支払場所")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("支払先")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("支払内容")).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("店名・内容"));
    await user.type(screen.getByLabelText("店名・内容"), "スーパー青葉");
    await user.clear(screen.getByLabelText("合計金額"));
    await user.type(screen.getByLabelText("合計金額"), "1680");
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith({
      draftId: "draft-review",
      documentType: "receipt",
      shopName: "スーパー青葉",
      date: "2026-06-01",
      amountYen: 1680,
      categoryId: "cat-daily",
      registrationMode: "detailed",
      items: [],
    });
    expect(registerReadyDraftsAsExpenseEntriesMock).not.toHaveBeenCalled();
  });

  it("税情報が不明で保存された下書きは合計だけ保存モードを維持する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") return [];
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "スーパー青葉",
          date: "2026-06-01",
          amountYen: 1680,
          categoryId: "cat-daily",
          reviewReasons: ["amount_mismatch"],
          receiptUserOverride: {
            source: "user",
            updatedAt: 1,
            fields: ["receiptTaxDecision"],
            values: {},
          },
          receiptTaxDecision: {
            priceTaxTreatment: "unknown",
            taxRateComposition: "unknown",
            resolutionStatus: "ambiguous",
            resolutionSource: "user",
            evidence: [],
            reasons: [],
            candidates: [],
            taxAmount: { roundingMethod: "unknown" },
          },
        },
        items: [{ itemName: "OCR商品", amountYen: 1200, categoryId: undefined, confidence: {} }],
      };
    });
    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/履歴・予算・カテゴリ集計には使われません/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "レシート合計だけ保存" }));
    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountYen: 1680, registrationMode: "totalOnly" }),
    );
  });

  it("保存方法の選択UIは表示せず、明細モードのまま保存する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") return [];
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "スーパー青葉",
          date: "2026-06-01",
          amountYen: 1680,
          categoryId: "cat-daily",
          reviewReasons: ["amount_mismatch"],
        },
        items: [{ itemName: "OCR商品", amountYen: 1200, categoryId: "cat-daily", confidence: {} }],
      };
    });
    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByRole("radio", { name: "レシート合計だけ保存" }),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "明細ごとに保存" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountYen: 1680, registrationMode: "detailed" }),
    );
  });

  it("OCR原文を確認し、ユーザー補正を明示操作でAI判定へ戻せる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "ユーザー補正店舗",
          date: "2026-06-01",
          amountYen: 803,
          categoryId: "cat-daily",
          reviewReasons: [],
          rawObservation: {
            source: "ai_ocr",
            observedAt: 1,
            lines: [
              {
                rawText: "合計 ￥８０３",
                amountText: "￥８０３",
                amountYen: 803,
                lineRoleCandidates: ["total"],
                roleConfidence: 0.98,
                explicitlyPrinted: true,
                sourceLineIndex: 0,
              },
            ],
          },
          receiptInterpretation: { source: "ai", interpretedAt: 1, values: {} },
          receiptUserOverride: {
            source: "user",
            updatedAt: 2,
            fields: ["amountYen"],
            values: {},
          },
        },
        items: [],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );
    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog", { name: "下書き確認" });
    await user.click(within(dialog).getByText("読み取り原文・詳しい税情報（参考）"));
    expect(within(dialog).getByRole("list", { name: "OCR原文" })).toHaveTextContent(
      "合計 ￥８０３",
    );
    await user.click(within(dialog).getByRole("button", { name: "AI判定へ戻す" }));

    expect(resetReceiptToAiInterpretationMock).toHaveBeenCalledWith({ draftId: "draft-review" });
  });

  it("明細あり下書きは状態を簡潔に表示し、明細は折りたたみで確認できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "ドラッグストアA",
          date: "2026-06-21",
          amountYen: 1380,
          categoryId: "cat-daily",
          reviewReasons: ["ambiguous_category", "amount_mismatch"],
          warnings: [],
          rawObservation: {
            source: "ai_ocr",
            observedAt: 1,
            lines: [
              {
                rawText: "読取不能 250円",
                amountText: "250円",
                amountYen: 250,
                lineRoleCandidates: ["item", "unknown"],
                roleConfidence: 0.4,
                explicitlyPrinted: true,
                sourceLineIndex: 4,
              },
            ],
          },
          receiptInterpretation: {
            source: "ai",
            interpretedAt: 1,
            values: {
              receiptLineClassifications: [
                {
                  sourceLineIndex: 4,
                  status: "ambiguous",
                  candidates: [
                    { role: "item", score: 0.51, evidence: ["ai_candidate:item"] },
                    { role: "unknown", score: 0.4, evidence: ["classification_ambiguous"] },
                  ],
                },
              ],
            },
          },
        },
        items: [
          {
            _id: "item-food",
            itemName: "パン",
            amountYen: 150,
            categoryId: "cat-food",
            confidence: { itemName: 0.9, amountYen: 0.95, categoryId: 0.8 },
            warnings: [],
          },
          {
            _id: "item-medical",
            itemName: "胃薬",
            amountYen: 980,
            confidence: { itemName: 0.85, amountYen: 0.95, categoryName: 0.5 },
            warnings: ["品名が不鮮明です"],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("店名・内容")).toHaveValue("ドラッグストアA");
    expect(within(dialog).getByLabelText("支出日（レシート記載日）")).toHaveValue("2026-06-21");
    expect(within(dialog).getByLabelText("合計金額")).toHaveValue("1380");
    expect(within(dialog).queryByText(/判定が曖昧なOCR行/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("region", { name: "全体の確認状態" })).toHaveTextContent(
      "差額 250円",
    );
    const itemInput = within(dialog).getByDisplayValue("パン");
    const detail = itemInput.closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    await user.click(detail.querySelector("summary")!);
    expect(detail).toHaveAttribute("open");
    expect(itemInput).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "下書きを保存" })).toBeEnabled();
  });

  it("複数カテゴリを同じ画面で確認して下書き保存する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "ドラッグストアA",
          date: "2026-06-21",
          amountYen: 1380,
          categoryId: "cat-daily",
          reviewReasons: ["multiple_categories"],
          warnings: ["unknown_amount_basis:items[0]", "unknown_amount_basis:items[1]"],
        },
        items: [
          { _id: "item-food", itemName: "パン", amountYen: 400, categoryId: "cat-food" },
          { _id: "item-daily", itemName: "洗剤", amountYen: 980, categoryId: "cat-daily" },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("region", { name: "商品一覧" })).toBeVisible();
    expect(within(dialog).getByRole("region", { name: "確認結果" })).toBeInTheDocument();
    expect(within(dialog).queryByText(/unknown_amount_basis/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "下書きを保存" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "修正して登録" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "登録準備OKに戻す" }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateForReviewMock).toHaveBeenCalled();
    expect(registerReadyDraftsAsExpenseEntriesMock).not.toHaveBeenCalled();
  });

  it("確認が必要な下書きの明細を表示し、編集・追加・削除して保存できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "ドラッグストアA",
          date: "2026-06-21",
          amountYen: 1380,
          categoryId: "cat-daily",
          reviewReasons: ["ambiguous_category", "amount_mismatch"],
          warnings: [],
        },
        items: [
          {
            _id: "item-food",
            itemName: "パン",
            amountYen: 150,
            categoryId: "cat-food",
            confidence: { itemName: 0.9, amountYen: 0.95, categoryId: 0.8 },
            warnings: [],
          },
          {
            _id: "item-medical",
            itemName: "胃薬",
            amountYen: 980,
            confidence: { itemName: 0.85, amountYen: 0.95, categoryName: 0.5 },
            warnings: ["品名が不鮮明です"],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("region", { name: "商品一覧" })).toBeInTheDocument();
    const amountCheck = within(dialog).getByRole("region", { name: "確認結果" });
    expect(within(amountCheck).getByText("支払額")).toBeInTheDocument();
    expect(within(amountCheck).getByText("1,380円")).toBeInTheDocument();
    expect(within(amountCheck).getByText("1,130円")).toBeInTheDocument();
    expect(within(dialog).getByText("低信頼度")).toBeInTheDocument();
    const initialCategoryInputs = within(dialog).getAllByLabelText("明細カテゴリ");
    expect(initialCategoryInputs).toHaveLength(2);
    expect(initialCategoryInputs[0]).toHaveValue("食費");
    expect(initialCategoryInputs[1]).toHaveValue("日用品");

    await user.click(initialCategoryInputs[0]);
    await user.click(screen.getByRole("option", { name: "日用品" }));
    expect(within(dialog).getAllByLabelText("明細カテゴリ")[0]).toHaveValue("日用品");

    await user.clear(within(dialog).getByDisplayValue("150"));
    await user.type(within(dialog).getAllByLabelText("レシートの金額")[0], "400");
    await user.click(within(dialog).getByRole("button", { name: "胃薬を削除" }));
    await user.click(within(dialog).getByRole("button", { name: "明細を追加" }));

    const itemNameInputs = within(dialog).getAllByLabelText("明細名");
    const amountInputs = within(dialog).getAllByLabelText("レシートの金額");
    await user.type(itemNameInputs[1], "牛乳");
    await user.type(amountInputs[1], "980");
    const categoryInputs = within(dialog).getAllByLabelText("明細カテゴリ");
    await user.click(categoryInputs[0]);
    await user.click(screen.getByRole("option", { name: "食費" }));
    await user.click(categoryInputs[1]);
    await user.click(screen.getByRole("option", { name: "食費" }));
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith({
      draftId: "draft-review",
      documentType: "receipt",
      shopName: "ドラッグストアA",
      date: "2026-06-21",
      amountYen: 1380,
      categoryId: "cat-daily",
      registrationMode: "detailed",
      items: [
        expect.objectContaining({
          itemName: "パン",
          amountYen: 400,
          categoryId: "cat-food",
        }),
        expect.objectContaining({
          itemName: "牛乳",
          amountYen: 980,
          categoryId: "cat-food",
        }),
      ],
    });
    const submittedItems = updateForReviewMock.mock.calls.at(-1)?.[0].items;
    expect(submittedItems[0]).toMatchObject({ itemId: "item-food" });
    expect(submittedItems[1]).not.toHaveProperty("itemId");
  }, 20_000);

  it("割引明細は負数で編集し、対象カテゴリの正味額として保存できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "クスリキリン堂 稲美店",
          date: "2026-06-29",
          amountYen: 990,
          categoryId: "cat-daily",
          reviewReasons: ["amount_mismatch"],
          warnings: [],
        },
        items: [
          {
            _id: "item-daily",
            itemName: "キュレル ジェルメイク",
            amountYen: 1100,
            categoryId: "cat-daily",
            confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
            warnings: [],
          },
          {
            _id: "item-discount",
            itemName: "クーポン券割引 10%",
            amountYen: -100,
            categoryId: "cat-daily",
            confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
            warnings: [],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");

    const amountInputs = within(dialog).getAllByLabelText("レシートの金額");
    expect(amountInputs[1]).toHaveAttribute("inputmode", "text");
    await user.clear(amountInputs[1]);
    await user.type(amountInputs[1], "-110");
    expect(amountInputs[1]).toHaveValue("-110");
    const amountCheck = within(dialog).getByRole("region", { name: "確認結果" });
    expect(within(amountCheck).getByText(/明細合計 990円/)).toBeVisible();
    expect(within(amountCheck).getByText(/支払額 990円/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            categoryId: "cat-daily",
          }),
        ]),
      }),
    );
  });

  it("対象不明の割引でも直前商品が自動選択され保存できる", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
        return [];
      }
      return {
        draft: {
          _id: args.draftId,
          status: "needs_review",
          documentType: "receipt",
          shopName: "クスリキリン堂 稲美店",
          date: "2026-06-29",
          amountYen: 990,
          categoryId: "cat-daily",
          reviewReasons: ["ambiguous_category"],
          warnings: [],
        },
        items: [
          {
            _id: "item-daily",
            itemName: "キュレル ジェルメイク",
            amountYen: 1100,
            categoryId: "cat-daily",
            confidence: { itemName: 0.9, amountYen: 0.9, categoryId: 0.9 },
            warnings: [],
          },
          {
            _id: "item-discount",
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            confidence: { itemName: 0.9, amountYen: 0.9, categoryName: 0.4 },
            warnings: ["割引対象が不明です"],
          },
        ],
      };
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText("対象商品のカテゴリから減額します")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "下書きを保存" }));

    expect(updateForReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            itemName: "クーポン券割引 10%",
            amountYen: -110,
            categoryId: "cat-daily",
          }),
        ]),
      }),
    );
  });

  it("確認下書きの詳細読み込み前はフォーム送信できない", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference === "aiExpenseDrafts.queries.getWithItems" && args !== "skip") {
        return undefined;
      }
      return [];
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("下書きを読み込んでいます。")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: /この内容で保存|下書きを保存|修正が必要な項目へ/,
      }),
    ).toBeDisabled();
    expect(within(dialog).queryByLabelText("合計金額")).not.toBeInTheDocument();
  });

  it("確認下書きが見つからない場合はローディングを続けずエラーを表示する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
      if (reference === "aiExpenseDrafts.queries.getWithItems" && args !== "skip") {
        return null;
      }
      return [];
    });

    renderWithProviders(
      <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("下書きを読み込んでいます。")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("下書きが見つかりません。一覧を更新してもう一度確認してください。"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: /この内容で保存|下書きを保存|修正が必要な項目へ/,
      }),
    ).toBeDisabled();
  });

  it("未判定の書類種別は選択肢に表示せず送信前に止める", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "unknown",
            shopName: "スーパー青葉",
            date: "2026-06-01",
            amountYen: 9120,
            categoryId: "cat-daily",
            reviewReasons: ["ambiguous_document_type"],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "修正が必要な項目へ" }));
    expect(within(dialog).getByRole("combobox", { name: "書類種別" })).toHaveFocus();

    await user.click(within(dialog).getByRole("combobox", { name: "書類種別" }));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByRole("option", { name: "種別未判定" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));

    expect(within(dialog).getByText("書類種別を選択してください。")).toBeInTheDocument();
    expect(updateForReviewMock).not.toHaveBeenCalled();
  });

  it("確認が必要な下書きを登録準備OKへ戻す送信分岐を呼べる", async () => {
    const user = userEvent.setup();
    const onReviewSubmit = vi.fn().mockResolvedValue({ status: "ready", reviewReasons: [] });

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "convenience_payment",
            shopName: "コンビニ北浜",
            paymentPlace: "コンビニ北浜",
            payeeName: "大阪市水道局",
            paymentPurpose: "",
            date: "2026-06-01",
            amountYen: 9120,
            categoryId: "cat-daily",
            reviewReasons: ["missing_required_field"],
          },
        }}
        onReviewSubmit={onReviewSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    const nameInput = screen.getByLabelText("店名・内容");
    expect(nameInput).toHaveValue("大阪市水道局");
    await user.clear(nameInput);
    await user.type(nameInput, "大阪市水道局 水道料金");
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    expect(onReviewSubmit).toHaveBeenCalledWith(
      "draft-review",
      expect.objectContaining({
        documentType: "convenience_payment",
        shopName: "大阪市水道局 水道料金",
        amountYen: 9120,
        categoryId: "cat-daily",
      }),
      false,
    );
    expect(registerReadyDraftsAsExpenseEntriesMock).not.toHaveBeenCalled();
  });

  it("登録済みアイテムに日付とカテゴリが表示される", () => {
    renderWithProviders(<AiExpenseQueuePanel initialItems={queueItems} categories={categories} />);

    const registeredSection = screen.getByRole("region", { name: "登録済み" });
    expect(within(registeredSection).getByText("2026/05/20 ・ 1,800円")).toBeInTheDocument();
    expect(within(registeredSection).getByText("日用品")).toBeInTheDocument();
  });

  it("保存結果がreadyならダイアログを閉じて登録可能のSnackbarを表示する", async () => {
    const user = userEvent.setup();
    updateForReviewMock.mockResolvedValueOnce({
      status: "ready",
      reviewReasons: [],
    });

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "receipt",
            shopName: "スーパー青葉",
            date: "2026-06-01",
            amountYen: 1680,
            categoryId: "cat-food",
            reviewReasons: ["low_confidence"],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/保存しました。登録できます。/)).toBeInTheDocument();
    expect(screen.getByText(/スーパー青葉・1,680円・食費/)).toBeInTheDocument();
  });

  it("保存に失敗した場合はダイアログと入力値を保持する", async () => {
    const user = userEvent.setup();
    updateForReviewMock.mockRejectedValueOnce(new Error("保存に失敗しました"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      renderWithProviders(
        <AiExpenseQueuePanel
          initialItems={[queueItems[1]]}
          categories={categories}
          initialReviewDrafts={{
            "draft-review": {
              _id: "draft-review",
              status: "needs_review",
              documentType: "receipt",
              shopName: "スーパー青葉",
              date: "2026-06-01",
              amountYen: 1680,
              categoryId: "cat-food",
              reviewReasons: ["amount_mismatch"],
            },
          }}
        />,
      );

      await user.click(screen.getByRole("button", { name: "確認する" }));
      const nameInput = screen.getByLabelText("店名・内容");
      const amountInput = screen.getByLabelText("合計金額");
      await user.clear(nameInput);
      await user.type(nameInput, "保存前の入力");
      await user.clear(amountInput);
      await user.type(amountInput, "7803");
      await user.click(screen.getByRole("button", { name: "下書きを保存" }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(nameInput).toHaveValue("保存前の入力");
      expect(amountInput).toHaveValue("7803");
      expect(
        screen
          .getAllByRole("alert")
          .some((alert) => alert.textContent?.includes("保存に失敗しました")),
      ).toBe(true);
      await user.click(screen.getByRole("button", { name: "下書きを保存" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(updateForReviewMock).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("保存結果がneeds_reviewでもダイアログを閉じて確認待ちを通知する", async () => {
    const user = userEvent.setup();
    updateForReviewMock.mockResolvedValueOnce({
      status: "needs_review",
      reviewReasons: ["amount_mismatch"],
    });

    renderWithProviders(
      <AiExpenseQueuePanel
        initialItems={[queueItems[1]]}
        categories={categories}
        initialReviewDrafts={{
          "draft-review": {
            _id: "draft-review",
            status: "needs_review",
            documentType: "receipt",
            shopName: "スーパー青葉",
            date: "2026-06-01",
            amountYen: 1680,
            categoryId: "cat-food",
            reviewReasons: ["amount_mismatch"],
          },
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "確認する" }));
    await user.click(screen.getByRole("button", { name: "下書きを保存" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/保存しました。確認待ちに残っています。/)).toBeInTheDocument();
    expect(screen.getByText(/確認ポイント：金額・税内訳の確認が必要/)).toBeInTheDocument();
  });

  describe("Issue #337 レシート入力UI改善の表示・操作回帰", () => {
    it("詳しい説明は折りたたみ内にだけ補足テキストを表示する", async () => {
      const user = userEvent.setup();
      renderWithProviders(<AiExpenseQueuePanel />);

      const detailText = screen.getByText(
        "読み取り時は画像を外部APIへ送信します（初回は同意が必要です）。",
      );
      expect(detailText).not.toBeVisible();
      await user.click(screen.getByRole("button", { name: "詳しい説明" }));
      await waitFor(() => {
        expect(detailText).toBeVisible();
      });
    });

    it("解析中の下書きは登録導線を出さず状態だけ表示する", () => {
      renderWithProviders(
        <AiExpenseQueuePanel
          initialItems={[
            {
              id: "draft-analyzing",
              fileName: "processing.png",
              status: "analyzing",
              documentType: "receipt",
            },
          ]}
        />,
      );

      const processingSection = screen.getByRole("region", { name: "読み取り中" });
      expect(within(processingSection).getByText("processing.png")).toBeInTheDocument();
      expect(
        within(processingSection).queryByRole("button", { name: "登録する" }),
      ).not.toBeInTheDocument();
      expect(
        within(processingSection).queryByRole("button", { name: "確認する" }),
      ).not.toBeInTheDocument();
    });

    it("下書き詳細は簡潔な状態と修正導線を表示する", async () => {
      const user = userEvent.setup();
      useQueryMock.mockImplementation((reference: string, args: { draftId?: string } | "skip") => {
        if (reference !== "aiExpenseDrafts.queries.getWithItems" || args === "skip") {
          return [];
        }
        return {
          draft: {
            _id: args.draftId,
            status: "needs_review",
            documentType: "receipt",
            shopName: "ドラッグストアA",
            date: "2026-06-21",
            amountYen: 1380,
            categoryId: "cat-daily",
            reviewReasons: ["ambiguous_category"],
            warnings: [],
          },
          items: [
            {
              _id: "item-food",
              itemName: "パン",
              amountYen: 150,
              categoryId: "cat-food",
              confidence: { itemName: 0.9, amountYen: 0.95, categoryId: 0.8 },
              warnings: [],
            },
          ],
        };
      });

      renderWithProviders(
        <AiExpenseQueuePanel initialItems={[queueItems[1]]} categories={categories} />,
      );

      await user.click(screen.getByRole("button", { name: "確認する" }));

      const dialog = screen.getByRole("dialog", { name: "下書き確認" });
      expect(within(dialog).queryByRole("heading", { name: "登録候補" })).not.toBeInTheDocument();
      expect(within(dialog).queryByText("食費 150円")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("region", { name: "商品一覧" })).toBeVisible();
      expect(within(dialog).getByRole("button", { name: "下書きを保存" })).toBeEnabled();
    });
  });
});
