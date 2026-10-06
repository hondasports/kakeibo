import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: useMutationMock, useQuery: useQueryMock }));

import { SystemAdminNotificationSettingsPage } from "./SystemAdminNotificationSettingsPage";

const settingsResult = {
  items: [
    {
      type: "ai_review_required",
      typeLabel: "AIレビュー依頼",
      channel: "line",
      channelLabel: "LINE",
      mandatory: false,
      enabled: false,
      configured: false,
    },
    {
      type: "group_deleted",
      typeLabel: "グループ削除の完了",
      channel: "email",
      channelLabel: "メール",
      mandatory: true,
      enabled: true,
      configured: false,
    },
  ],
};

describe("SystemAdminNotificationSettingsPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useQueryMock.mockReturnValue(settingsResult);
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ changed: true }));
  });

  it("キャンセルではmutationを呼ばずダイアログを閉じる", async () => {
    const update = vi.fn();
    useMutationMock.mockReturnValue(update);
    render(<SystemAdminNotificationSettingsPage />);

    await userEvent.click(screen.getByRole("switch", { name: "AIレビュー依頼のLINE通知" }));
    const dialog = screen.getByRole("dialog", { name: "通知設定の変更" });
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));

    expect(update).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "通知設定の変更" })).not.toBeInTheDocument(),
    );
  });

  it("理由なし・必須メール未確認では保存できず、有効後に正確なpayloadでmutationを呼ぶ", async () => {
    const update = vi.fn().mockResolvedValue({ changed: true });
    useMutationMock.mockReturnValue(update);
    render(<SystemAdminNotificationSettingsPage />);

    await userEvent.click(screen.getByRole("switch", { name: "グループ削除の完了のメール通知" }));
    const dialog = screen.getByRole("dialog", { name: "通知設定の変更" });
    const save = within(dialog).getByRole("button", { name: "保存" });

    expect(within(dialog).getByText(/このメールは必須通知です/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "変更理由（必須）" }),
      "  停止の検証  ",
    );
    expect(save).toBeDisabled();

    await userEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "必須メールを停止することを確認しました",
      }),
    );
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(update).toHaveBeenCalledWith({
      type: "group_deleted",
      channel: "email",
      enabled: false,
      reason: "停止の検証",
      confirmMandatoryEmailDisable: true,
    });
    expect(await screen.findByText("通知設定を更新しました")).toBeInTheDocument();
  });

  it("非必須の変更は理由のみで保存できる", async () => {
    const update = vi.fn().mockResolvedValue({ changed: true });
    useMutationMock.mockReturnValue(update);
    render(<SystemAdminNotificationSettingsPage />);

    await userEvent.click(screen.getByRole("switch", { name: "AIレビュー依頼のLINE通知" }));
    const dialog = screen.getByRole("dialog", { name: "通知設定の変更" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "変更理由（必須）" }),
      "有効化",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(update).toHaveBeenCalledWith({
      type: "ai_review_required",
      channel: "line",
      enabled: true,
      reason: "有効化",
    });
  });

  it("保存失敗はダイアログ内に表示され開いたままになる", async () => {
    const update = vi.fn().mockRejectedValue(new Error("denied"));
    useMutationMock.mockReturnValue(update);
    render(<SystemAdminNotificationSettingsPage />);

    await userEvent.click(screen.getByRole("switch", { name: "AIレビュー依頼のLINE通知" }));
    const dialog = screen.getByRole("dialog", { name: "通知設定の変更" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "変更理由（必須）" }),
      "有効化",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByText(/通知設定を更新できませんでした/)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "通知設定の変更" })).toBeInTheDocument();
  });

  it("保存中は入力・スイッチ・ボタンをdisabledにする", async () => {
    let resolve: (v: unknown) => void = () => {};
    const update = vi.fn().mockImplementation(() => new Promise((r) => (resolve = r)));
    useMutationMock.mockReturnValue(update);
    render(<SystemAdminNotificationSettingsPage />);

    await userEvent.click(screen.getByRole("switch", { name: "AIレビュー依頼のLINE通知" }));
    const dialog = screen.getByRole("dialog", { name: "通知設定の変更" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "変更理由（必須）" }),
      "有効化",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(within(dialog).getByRole("textbox", { name: "変更理由（必須）" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "キャンセル" })).toBeDisabled();
    expect(
      screen.getByRole("switch", {
        name: "AIレビュー依頼のLINE通知",
        hidden: true,
      }),
    ).toBeDisabled();

    resolve({ changed: true });
    expect(await screen.findByText("通知設定を更新しました")).toBeInTheDocument();
  });
});
