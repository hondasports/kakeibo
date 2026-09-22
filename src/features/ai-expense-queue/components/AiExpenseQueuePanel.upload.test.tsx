import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { describe, expect, it } from "vitest";
import "./AiExpenseQueuePanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { theme } from "../../../theme";
import { AiExpenseQueuePanel } from "./AiExpenseQueuePanel";
import { categories, rejectImageDecoding } from "../../receipt-review/utils/testFixtures";
import {
  registerReadyDraftsAsExpenseEntriesMock,
  createBatchMock,
  analyzeImageJobMock,
  acceptReceiptImageExternalApiConsentMock,
  useQueryMock,
} from "./AiExpenseQueuePanelTestMocks";

describe("AiExpenseQueuePanel（アップロード）", () => {
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
});
