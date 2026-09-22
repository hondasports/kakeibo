import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "./AiExpenseQueuePanelTestMocks";
import { renderWithProviders } from "../../../test/render";
import { AiExpenseQueuePanel } from "./AiExpenseQueuePanel";
import { queueItems, rejectImageDecoding } from "../../receipt-review/utils/testFixtures";
import {
  registerReadyDraftsAsExpenseEntriesMock,
  createBatchMock,
  analyzeImageJobMock,
  retryImageJobMock,
  cancelImageJobMock,
  deleteDraftMock,
  useQueryMock,
} from "./AiExpenseQueuePanelTestMocks";

describe("AiExpenseQueuePanel（再試行・削除）", () => {
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
});
