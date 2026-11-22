import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { GroupDeletionStatusPage } from "./GroupDeletionStatusPage";

const { navigateMock, resumeMock, useMutationMock, useQueryMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  resumeMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    groups: {
      deletion: {
        getGroupDeletionStatus: "groups.deletion.getGroupDeletionStatus",
        resumeGroupDeletion: "groups.deletion.resumeGroupDeletion",
      },
      queries: { listMyGroups: "groups.queries.listMyGroups" },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

function renderPage() {
  renderWithProviders(
    <MemoryRouter initialEntries={["/group/delete/status/job-001"]}>
      <Routes>
        <Route path="/group/delete/status/:jobId" element={<GroupDeletionStatusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GroupDeletionStatusPage", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    resumeMock.mockReset();
    resumeMock.mockResolvedValue(null);
    useMutationMock.mockReturnValue(resumeMock);
    useQueryMock.mockReset();
  });

  it.each([
    ["requested", "グループの削除処理を開始しました"],
    ["running", "グループを削除しています"],
    ["retry_wait", "グループの削除を自動再試行しています"],
  ])("%sを内部エラーや進捗率なしで表示する", (status, heading) => {
    useQueryMock.mockImplementation((reference: string) =>
      reference.includes("getGroupDeletionStatus")
        ? { jobId: "job-001", groupName: "佐藤家", status, updatedAt: 1 }
        : undefined,
    );
    renderPage();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText(/%|残り時間|batch_processing/)).not.toBeInTheDocument();
  });

  it("failedはoriginal requester向け再開操作を表示する", async () => {
    useQueryMock.mockImplementation((reference: string) =>
      reference.includes("getGroupDeletionStatus")
        ? { jobId: "job-001", groupName: "佐藤家", status: "failed", updatedAt: 1 }
        : undefined,
    );
    renderPage();
    await userEvent.setup().click(screen.getByRole("button", { name: "削除を再開する" }));
    expect(resumeMock).toHaveBeenCalledWith({ jobId: "job-001" });
  });

  it("completed後に残グループがあれば選択画面へ進む", async () => {
    useQueryMock.mockImplementation((reference: string) => {
      if (reference.includes("getGroupDeletionStatus"))
        return { jobId: "job-001", groupName: "佐藤家", status: "completed", updatedAt: 1 };
      if (reference.includes("listMyGroups")) return [{ _id: "group-002" }];
      return undefined;
    });
    renderPage();
    await userEvent.setup().click(screen.getByRole("button", { name: "グループ選択へ進む" }));
    expect(navigateMock).toHaveBeenCalledWith("/group/select");
  });

  it("jobなしと権限なしを区別せず、通常導線へのボタンを置く", async () => {
    useQueryMock.mockReturnValue(null);
    renderPage();
    expect(
      screen.getByRole("heading", { name: "グループ削除の要求が見つかりません" }),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "新しいグループを作成する" }));
    expect(navigateMock).toHaveBeenCalledWith("/group/setup");
  });

  it("通信errorを再読み込み可能な状態として表示する", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      useQueryMock.mockImplementation(() => {
        throw new Error("network error");
      });
      renderPage();
      expect(
        screen.getByRole("heading", { name: "グループ削除状況を読み込めませんでした" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
