import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test/render";
import { MonthlyIncomeSettingsPanel } from "./MonthlyIncomeSettingsPanel";

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
        updateMonthlyIncome: "users.mutations.updateMonthlyIncome",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

describe("MonthlyIncomeSettingsPanel", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useQueryMock.mockReturnValue(undefined);
    useMutationMock.mockReturnValue(vi.fn());
  });

  it("プロファイル取得中はローディング状態を表示する", () => {
    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    expect(screen.getByLabelText("月収入の設定を読み込んでいます")).toBeInTheDocument();
  });

  it("未設定なら「未設定」と空の入力欄を表示する", () => {
    useQueryMock.mockReturnValue({ monthlyIncome: null });

    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    expect(screen.getByText("未設定")).toBeInTheDocument();
    expect(screen.getByLabelText("月収入")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "変更を保存" })).toBeDisabled();
  });

  it("設定済みの月収入を表示する", () => {
    useQueryMock.mockReturnValue({ monthlyIncome: 300_000 });

    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    expect(screen.getByText("300,000円")).toBeInTheDocument();
    expect(screen.getByLabelText("月収入")).toHaveValue(300_000);
  });

  it("値を変更して保存するとmutationに金額を渡す", async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockReturnValue(updateMock);
    useQueryMock.mockReturnValue({ monthlyIncome: null });
    const user = userEvent.setup();

    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    await user.type(screen.getByLabelText("月収入"), "250000");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(updateMock).toHaveBeenCalledWith({ monthlyIncome: 250_000 });
    expect(await screen.findByText("月収入を250,000円に設定しました")).toBeInTheDocument();
  });

  it("空欄で保存すると未設定に戻す", async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockReturnValue(updateMock);
    useQueryMock.mockReturnValue({ monthlyIncome: 300_000 });
    const user = userEvent.setup();

    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    await user.clear(screen.getByLabelText("月収入"));
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(updateMock).toHaveBeenCalledWith({});
    expect(await screen.findByText("月収入の設定を解除しました")).toBeInTheDocument();
  });

  it("範囲外の値では保存できない", async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockReturnValue(updateMock);
    useQueryMock.mockReturnValue({ monthlyIncome: null });
    const user = userEvent.setup();

    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    await user.type(screen.getByLabelText("月収入"), "1000000000");

    expect(screen.getByRole("button", { name: "変更を保存" })).toBeDisabled();
    expect(
      screen.getByText("0以上999,999,999以下の整数（円）で入力してください"),
    ).toBeInTheDocument();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("保存に失敗したらエラーを通知する", async () => {
    const updateMock = vi.fn().mockRejectedValue(new Error("fail"));
    useMutationMock.mockReturnValue(updateMock);
    useQueryMock.mockReturnValue({ monthlyIncome: null });
    const user = userEvent.setup();

    renderWithProviders(<MonthlyIncomeSettingsPanel />);

    await user.type(screen.getByLabelText("月収入"), "250000");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("月収入を保存できませんでした")).toBeInTheDocument();
  });
});
