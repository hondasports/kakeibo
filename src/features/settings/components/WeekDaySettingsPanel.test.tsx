import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test/render";
import { WeekDaySettingsPanel } from "./WeekDaySettingsPanel";

const { useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    users: {
      queries: {
        getUserProfile: "users.queries.getUserProfile",
      },
      mutations: {
        updateWeeklyDays: "users.mutations.updateWeeklyDays",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

describe("WeekDaySettingsPanel", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useQueryMock.mockReturnValue(undefined);
    useMutationMock.mockReturnValue(vi.fn());
  });

  it("プロファイル取得中はローディング状態を表示する", () => {
    useQueryMock.mockReturnValue(undefined);

    renderWithProviders(<WeekDaySettingsPanel />);

    expect(screen.getByLabelText("週の設定を読み込んでいます")).toBeInTheDocument();
  });

  it("初期値と自動算出された週末日が表示される", () => {
    useQueryMock.mockReturnValue({
      monthlyIncome: null,
      weeklyStartDay: 1,
      weeklyEndDay: 0,
    });

    renderWithProviders(<WeekDaySettingsPanel />);

    expect(screen.getByLabelText("週の始まり")).toHaveTextContent("月曜日");
    expect(screen.getByRole("status", { name: "週の終わり" })).toHaveTextContent("日曜日");
    expect(screen.getByText(/月曜日.*から.*日曜日.*まで/)).toBeInTheDocument();
  });

  it("値を変更して保存できる", async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockReturnValue(mockUpdate);
    useQueryMock.mockReturnValue({
      monthlyIncome: null,
      weeklyStartDay: 1,
      weeklyEndDay: 0,
    });

    renderWithProviders(<WeekDaySettingsPanel />);

    await userEvent.click(screen.getByLabelText("週の始まり"));
    await userEvent.click(screen.getByRole("option", { name: "火曜日" }));

    await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(mockUpdate).toHaveBeenCalledWith({
      weeklyStartDay: 2,
      weeklyEndDay: 1,
    });
  });

  it("保存中はボタンが無効になる", async () => {
    let resolveMutation: (() => void) | undefined;
    const mockUpdate = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutation = resolve;
        }),
    );
    useMutationMock.mockReturnValue(mockUpdate);
    useQueryMock.mockReturnValue({
      monthlyIncome: null,
      weeklyStartDay: 1,
      weeklyEndDay: 0,
    });

    renderWithProviders(<WeekDaySettingsPanel />);

    await userEvent.click(screen.getByLabelText("週の始まり"));
    await userEvent.click(screen.getByRole("option", { name: "火曜日" }));
    await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();

    if (resolveMutation) {
      resolveMutation();
    }
  });

  it("値が未変更なら保存ボタンは無効で、変更すると未保存表示になる", async () => {
    useQueryMock.mockReturnValue({
      monthlyIncome: null,
      weeklyStartDay: 1,
      weeklyEndDay: 0,
    });

    renderWithProviders(<WeekDaySettingsPanel />);

    expect(screen.getByRole("button", { name: "変更を保存" })).toBeDisabled();
    expect(screen.queryByText("未保存の変更があります")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("週の始まり"));
    await userEvent.click(screen.getByRole("option", { name: "火曜日" }));

    expect(screen.getByRole("button", { name: "変更を保存" })).toBeEnabled();
    expect(screen.getByText("未保存の変更があります")).toBeInTheDocument();
  });

  it("保存に失敗したらエラー通知を表示する", async () => {
    useMutationMock.mockReturnValue(vi.fn().mockRejectedValue(new Error("save failed")));
    useQueryMock.mockReturnValue({
      monthlyIncome: null,
      weeklyStartDay: 1,
      weeklyEndDay: 0,
    });

    renderWithProviders(<WeekDaySettingsPanel />);

    await userEvent.click(screen.getByLabelText("週の始まり"));
    await userEvent.click(screen.getByRole("option", { name: "火曜日" }));
    await userEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    const errorMessage = await screen.findByText("週の設定を保存できませんでした");
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage.closest(".MuiAlert-root")).toHaveClass("MuiAlert-colorError");
  });
});
