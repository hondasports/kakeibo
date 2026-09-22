import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiExpenseQueueItem } from "../../../../types/aiExpenseQueue";
import { QueueStatusHeader } from "./QueueStatusHeader";

const reviewItem = { id: "review-1", status: "needs_review" } as AiExpenseQueueItem;

function grouped(
  overrides: Partial<
    Record<"processing" | "ready" | "needs_review" | "failed" | "registered", AiExpenseQueueItem[]>
  > = {},
) {
  return {
    processing: [],
    ready: [],
    needs_review: [],
    failed: [],
    registered: [],
    ...overrides,
  };
}

describe("QueueStatusHeader", () => {
  it("0件の状態を表示しない", () => {
    render(<QueueStatusHeader groupedItems={grouped()} onOpenReview={vi.fn()} />);

    expect(screen.queryByText(/0件/)).not.toBeInTheDocument();
  });

  it("確認待ちの件数と確認導線を表示する", () => {
    render(
      <QueueStatusHeader
        firstReviewItem={reviewItem}
        groupedItems={grouped({ needs_review: [reviewItem] })}
        onOpenReview={vi.fn()}
      />,
    );

    expect(screen.getByText("確認待ち 1件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認する（1件）" })).toBeInTheDocument();
  });
});
