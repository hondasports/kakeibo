import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { MemoryRouter, useLocation } from "react-router-dom";
import { LineLinkSettingsPanel } from "./LineLinkSettingsPanel";

const { useActionMock, useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useActionMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    lineLink: {
      actions: { start: "lineLink.actions.start" },
      mutations: { unlink: "lineLink.mutations.unlink" },
      queries: { getStatus: "lineLink.queries.getStatus" },
    },
  },
}));

vi.mock("convex/react", () => ({
  useAction: useActionMock,
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

describe("LineLinkSettingsPanel", () => {
  beforeEach(() => {
    useActionMock.mockReset();
    useMutationMock.mockReset();
    useQueryMock.mockReset();
    useActionMock.mockReturnValue(vi.fn());
    useMutationMock.mockReturnValue(vi.fn());
  });

  it("未連携状態で安全な連携開始操作を表示する", () => {
    useQueryMock.mockReturnValue({ status: "unlinked" });

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "LINE連携", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("LINEアカウントは連携されていません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LINEと連携する" })).toBeEnabled();
  });

  it.each([
    ["expired", "連携の有効期限が切れました。もう一度お試しください"],
    ["failed", "LINE連携を完了できませんでした。もう一度お試しください"],
  ])("%s feedbackを表示してURLからqueryを除去する", async (feedback, message) => {
    useQueryMock.mockReturnValue({ status: "unlinked" });

    renderWithProviders(
      <MemoryRouter initialEntries={[`/settings?line=${feedback}`]}>
        <SettingsPanelWithLocation />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(message));
    expect(screen.getByTestId("location-search")).toHaveTextContent("");
  });

  it("navigation stateからcallback feedbackを復元して表示する", () => {
    useQueryMock.mockReturnValue({ status: "linked", linkedAt: Date.now() });

    renderWithProviders(
      <MemoryRouter
        initialEntries={[{ pathname: "/settings", state: { lineLinkFeedback: "success" } }]}
      >
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("LINEアカウントを連携しました");
  });

  it("連携開始に失敗するとfailed feedbackを表示する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({ status: "unlinked" });
    useActionMock.mockReturnValue(vi.fn().mockRejectedValue(new Error("unavailable")));

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "LINEと連携する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "LINE連携を完了できませんでした。もう一度お試しください",
    );
  });

  it("連携開始中は操作を無効化して進行中状態を表示する", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue({ status: "unlinked" });
    useActionMock.mockReturnValue(vi.fn().mockReturnValue(new Promise(() => undefined)));

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "LINEと連携する" }));
    expect(screen.getByRole("button", { name: /連携を開始中/ })).toBeDisabled();
  });

  it("連携済み状態では解除確認を表示し、解除成功後に閉じる", async () => {
    const user = userEvent.setup();
    const unlink = vi.fn().mockResolvedValue(null);
    useQueryMock.mockReturnValue({ status: "linked", linkedAt: Date.now() });
    useMutationMock.mockReturnValue(unlink);

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText("LINEアカウントは連携されています")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "連携を解除する" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("LINE連携を解除しますか？");
    await user.click(screen.getByRole("button", { name: "解除する" }));

    await waitFor(() => expect(unlink).toHaveBeenCalledWith({}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("連携が複数ある場合は通知不可と解除後の再連携を案内し、解除できる", async () => {
    const user = userEvent.setup();
    const unlink = vi.fn().mockResolvedValue({ status: "unlinked" });
    useQueryMock.mockReturnValue({ status: "multiple" });
    useMutationMock.mockReturnValue(unlink);

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText("LINE連携を確認してください")).toBeInTheDocument();
    expect(
      screen.getByText(
        "LINE通知を受け取れません。一度連携を解除してから、もう一度連携してください。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("LINEアカウントは連携されています")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "LINEと連携する" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "連携を解除する" }));
    await user.click(screen.getByRole("button", { name: "解除する" }));
    await waitFor(() => expect(unlink).toHaveBeenCalledWith({}));
  });

  it("複数連携のときは古い連携成功メッセージを表示しない", () => {
    useQueryMock.mockReturnValue({ status: "multiple" });
    renderWithProviders(
      <MemoryRouter
        initialEntries={[{ pathname: "/settings", state: { lineLinkFeedback: "success" } }]}
      >
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText("LINE連携を確認してください")).toBeInTheDocument();
    expect(screen.queryByText("LINEアカウントを連携しました")).not.toBeInTheDocument();
  });

  it("別の操作で複数連携が解除されても古い成功メッセージを表示しない", () => {
    useQueryMock.mockReturnValue({ status: "multiple" });
    const panel = (
      <MemoryRouter
        initialEntries={[{ pathname: "/settings", state: { lineLinkFeedback: "success" } }]}
      >
        <LineLinkSettingsPanel />
      </MemoryRouter>
    );
    const { rerender } = render(panel);
    expect(screen.getByText("LINE連携を確認してください")).toBeInTheDocument();
    expect(screen.queryByText("LINEアカウントを連携しました")).not.toBeInTheDocument();

    useQueryMock.mockReturnValue({ status: "unlinked" });
    rerender(
      <MemoryRouter
        initialEntries={[{ pathname: "/settings", state: { lineLinkFeedback: "success" } }]}
      >
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText("LINEアカウントは連携されていません")).toBeInTheDocument();
    expect(screen.queryByText("LINEアカウントを連携しました")).not.toBeInTheDocument();
  });

  it("解除中は確認ダイアログの操作を無効化する", async () => {
    const user = userEvent.setup();
    const unlink = vi.fn().mockReturnValue(new Promise(() => undefined));
    useQueryMock.mockReturnValue({ status: "linked", linkedAt: Date.now() });
    useMutationMock.mockReturnValue(unlink);

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "連携を解除する" }));
    await user.click(screen.getByRole("button", { name: "解除する" }));

    expect(screen.getByRole("button", { name: "解除中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeDisabled();
  });

  it("解除に失敗するとfailed feedbackを表示して確認を維持する", async () => {
    const user = userEvent.setup();
    const unlink = vi.fn().mockRejectedValue(new Error("unavailable"));
    useQueryMock.mockReturnValue({ status: "linked", linkedAt: Date.now() });
    useMutationMock.mockReturnValue(unlink);

    renderWithProviders(
      <MemoryRouter>
        <LineLinkSettingsPanel />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "連携を解除する" }));
    await user.click(screen.getByRole("button", { name: "解除する" }));

    expect(await screen.findByRole("alert", { hidden: true })).toHaveTextContent(
      "LINE連携を完了できませんでした。もう一度お試しください",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

function SettingsPanelWithLocation() {
  const location = useLocation();
  return (
    <>
      <LineLinkSettingsPanel />
      <output data-testid="location-search">{location.search}</output>
    </>
  );
}
