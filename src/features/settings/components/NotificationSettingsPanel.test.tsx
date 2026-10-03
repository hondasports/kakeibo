import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test/render";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";

const { useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    notifications: {
      queries: {
        getMyNotificationSettings: "notifications.queries.getMyNotificationSettings",
      },
      mutations: {
        updateMyNotificationPreference: "notifications.mutations.updateMyNotificationPreference",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

const defaultSettings = {
  emailEnabled: true,
  lineEnabled: false,
  lineLinked: true,
  emailGloballyEnabled: true,
  lineGloballyEnabled: true,
};

describe("NotificationSettingsPanel", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useQueryMock.mockReturnValue(defaultSettings);
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
  });

  it("読み込み中はスケルトンを表示する", () => {
    useQueryMock.mockReturnValue(undefined);
    renderWithProviders(<NotificationSettingsPanel />);
    expect(screen.getByRole("heading", { name: "通知設定" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("読み込みに失敗しても見出しを維持して局所エラーを表示する", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    useQueryMock.mockImplementation(() => {
      throw new Error("backend unavailable");
    });

    try {
      renderWithProviders(<NotificationSettingsPanel />);
      expect(screen.getByRole("heading", { name: "通知設定" })).toBeInTheDocument();
      expect(screen.getByText("この設定を読み込めませんでした。")).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("メール/LINEスイッチと必須メールの読み取り専用リストを表示する", () => {
    renderWithProviders(<NotificationSettingsPanel />);
    expect(screen.getByRole("switch", { name: "AIレビューのメール通知" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "AIレビューのLINE通知" })).not.toBeChecked();
    expect(screen.getByText(/個別に停止できません/)).toBeInTheDocument();
    expect(screen.getByText("グループからの除外")).toBeInTheDocument();
  });

  it("メール通知をOFFにしてmutationを呼び成功フィードバックを表示する", async () => {
    const update = vi.fn().mockResolvedValue({});
    useMutationMock.mockReturnValue(update);
    renderWithProviders(<NotificationSettingsPanel />);

    await userEvent.click(screen.getByRole("switch", { name: "AIレビューのメール通知" }));
    expect(update).toHaveBeenCalledWith({
      type: "ai_review_required",
      channel: "email",
      enabled: false,
    });
    expect(await screen.findByText("通知設定を保存しました")).toBeInTheDocument();
  });

  it("保存失敗時にエラーフィードバックを表示する", async () => {
    const update = vi.fn().mockRejectedValue(new Error("denied"));
    useMutationMock.mockReturnValue(update);
    renderWithProviders(<NotificationSettingsPanel />);

    await userEvent.click(screen.getByRole("switch", { name: "AIレビューのメール通知" }));
    expect(
      await screen.findByText("通知設定を保存できませんでした。もう一度お試しください"),
    ).toBeInTheDocument();
  });

  it("LINE未連携ではLINEスイッチがdisabledになり説明を表示する", () => {
    useQueryMock.mockReturnValue({ ...defaultSettings, lineLinked: false });
    renderWithProviders(<NotificationSettingsPanel />);
    expect(screen.getByRole("switch", { name: "AIレビューのLINE通知" })).toBeDisabled();
    expect(screen.getByText(/連携しても自動ではONになりません/)).toBeInTheDocument();
    expect(screen.getByText(/連携が有効な間だけ届きます/)).toBeInTheDocument();
  });

  it("LINE未連携でも保存済みのONはOFFに戻せる", async () => {
    const update = vi.fn().mockResolvedValue({});
    useMutationMock.mockReturnValue(update);
    useQueryMock.mockReturnValue({
      ...defaultSettings,
      lineLinked: false,
      lineEnabled: true,
    });
    renderWithProviders(<NotificationSettingsPanel />);
    const lineSwitch = screen.getByRole("switch", { name: "AIレビューのLINE通知" });
    expect(lineSwitch).toBeEnabled();
    await userEvent.click(lineSwitch);
    expect(update).toHaveBeenCalledWith({
      type: "ai_review_required",
      channel: "line",
      enabled: false,
    });
  });

  it("全体OFFの場合は個人設定とは別に注意を表示する", () => {
    useQueryMock.mockReturnValue({
      ...defaultSettings,
      lineGloballyEnabled: false,
      emailGloballyEnabled: false,
    });
    renderWithProviders(<NotificationSettingsPanel />);
    expect(
      screen.getByText(
        "AIレビューのLINE通知は全体設定で停止されています。個人設定はそのまま保存されます。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "AIレビューのメール通知は全体設定で停止されています。個人設定はそのまま保存されます。",
      ),
    ).toBeInTheDocument();
  });
});
