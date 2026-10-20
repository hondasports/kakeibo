import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Doc } from "../../../../convex/_generated/dataModel";
import "../components/AiExpenseQueuePanelTestMocks";
import { analyzeImageJobMock, retryImageJobMock } from "../components/AiExpenseQueuePanelTestMocks";
import { useRetry } from "./useRetry";

const savedJob = {
  _id: "saved-job",
  batchId: "saved-batch",
  draftId: "saved-draft",
  status: "failed",
} as Doc<"receiptAnalysisImageJobs">;

describe("セッション外の下書きの再解析", () => {
  it("実際に再解析するバッチを追跡し、再解析後の下書きにも画像を紐づける", async () => {
    const { result } = renderHook(() =>
      useRetry({
        pendingImageDataUrls: new Map([["saved-job", "data:image/png;base64,retry"]]),
        setPendingImageDataUrls: vi.fn(),
      }),
    );
    await act(async () => result.current.handleReanalyze("saved-draft", [savedJob]));
    expect(retryImageJobMock).toHaveBeenCalledWith({ jobId: "saved-job" });
    expect(analyzeImageJobMock).toHaveBeenCalledWith({
      jobId: "saved-job",
      imageDataUrl: "data:image/png;base64,retry",
    });
    expect(result.current.retryBatchIds).toEqual(["saved-batch"]);
  });

  it("画像を選び直す前はバッチの追跡を増やさない", async () => {
    const { result } = renderHook(() =>
      useRetry({ pendingImageDataUrls: new Map(), setPendingImageDataUrls: vi.fn() }),
    );
    await act(async () => result.current.handleRetry("saved-draft", [savedJob]));
    expect(result.current.retryBatchIds).toEqual([]);
    expect(retryImageJobMock).not.toHaveBeenCalled();
  });
});
