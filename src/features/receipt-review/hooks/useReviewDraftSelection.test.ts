import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReviewDraftSelection } from "./useReviewDraftSelection";

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: useQueryMock }));

const convexDetails = (status: string) => ({
  draft: {
    _id: "draft-1",
    status,
    documentType: "receipt",
    reviewReasons: [],
  },
  items: [],
});

function renderSelection() {
  return renderHook(() =>
    useReviewDraftSelection({ initialReviewDrafts: {}, initialReviewDraftItems: {} }),
  );
}

describe("useReviewDraftSelection", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it.each(["queued", "analyzing"] as const)(
    "レビュー対象外の status %s の下書きは選択を解除してレビューを開かない",
    (status) => {
      useQueryMock.mockImplementation((_reference: unknown, args: unknown) =>
        args === "skip" ? undefined : convexDetails(status),
      );
      const { result } = renderSelection();
      act(() => result.current.setSelectedReviewDraftId("draft-1"));
      expect(result.current.selectedReviewDraftId).toBeNull();
      expect(result.current.selectedReviewDraft).toBeNull();
      expect(result.current.selectedReviewDraftDetails?.draft ?? null).toBeNull();
    },
  );

  it("レビュー可能な status の下書きは選択と詳細を保持する", () => {
    useQueryMock.mockImplementation((_reference: unknown, args: unknown) =>
      args === "skip" ? undefined : convexDetails("needs_review"),
    );
    const { result } = renderSelection();
    act(() => result.current.setSelectedReviewDraftId("draft-1"));
    expect(result.current.selectedReviewDraftId).toBe("draft-1");
    expect(result.current.selectedReviewDraft?.status).toBe("needs_review");
    expect(result.current.selectedReviewDraftDetails?.draft.status).toBe("needs_review");
  });
});
