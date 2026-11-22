import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: useMutationMock, useQuery: useQueryMock }));

import { SystemAdminGroupDeletionPage } from "./SystemAdminGroupDeletionPage";

describe("SystemAdminGroupDeletionPage", () => {
  const resumeMock = vi.fn();

  beforeEach(() => {
    resumeMock.mockReset().mockResolvedValue(null);
    useMutationMock.mockReturnValue(resumeMock);
    useQueryMock.mockReturnValue({
      environment: "preview",
      isDone: true,
      continueCursor: "",
      page: [
        {
          jobId: "job-1",
          targetGroupIdSnapshot: "group-1",
          targetGroupNameSnapshot: "対象家計",
          source: "owner",
          status: "failed",
          stage: "categories",
          isActive: false,
          attemptCount: 6,
          maxAttempts: 6,
          lastErrorCategory: "batch_processing_failed",
          deletedCounts: {},
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
  });

  it("failed jobだけを再開確認し、理由を送信する", async () => {
    const user = userEvent.setup();
    render(<SystemAdminGroupDeletionPage />);
    await user.click(screen.getByRole("button", { name: "再開" }));
    expect(screen.getByText("削除処理を再開")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "再開理由" }), "原因を確認したため");
    await user.click(screen.getByRole("button", { name: "再開する" }));
    expect(resumeMock).toHaveBeenCalledWith({ jobId: "job-1", reason: "原因を確認したため" });
  });

  it("requestedステータスで絞り込める", async () => {
    const user = userEvent.setup();
    render(<SystemAdminGroupDeletionPage />);
    await user.click(screen.getByRole("combobox", { name: "状態" }));
    await user.click(screen.getByRole("option", { name: "受付済み" }));
    expect(useQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "requested" }),
    );
  });
});
