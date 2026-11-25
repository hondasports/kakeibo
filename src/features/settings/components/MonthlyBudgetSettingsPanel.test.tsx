import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithProviders } from "../../../test/render";
import { MonthlyBudgetSettingsPanel } from "./MonthlyBudgetSettingsPanel";

const useQueryMock = vi.fn();
const setBudgetMock = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (endpoint: unknown) => (endpoint === "set-monthly-budget" ? setBudgetMock : vi.fn()),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "groups.queries.getMyGroup": "get-my-group",
    "groups.mutations.setMonthlyBudget": "set-monthly-budget",
  }),
}));

let myGroup: unknown;
function renderPanel() {
  useQueryMock.mockImplementation((endpoint: unknown) =>
    endpoint === "get-my-group" ? myGroup : undefined,
  );
  return renderWithProviders(<MonthlyBudgetSettingsPanel />);
}

describe("MonthlyBudgetSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBudgetMock.mockResolvedValue(null);
    myGroup = { role: "owner", monthlyBudgetYen: null };
  });

  it("読込中は入力欄を出さない", () => {
    myGroup = undefined;
    const { container } = renderPanel();
    expect(screen.queryByLabelText("月予算（円）")).not.toBeInTheDocument();
    expect(container.querySelector(".MuiSkeleton-root")).not.toBeNull();
  });

  it("owner以外は編集できず、現在の予算を表示する", () => {
    myGroup = { role: "member", monthlyBudgetYen: 50000 };
    renderPanel();

    expect(screen.getByText(/月予算の変更はグループのオーナーのみ行えます/)).toBeInTheDocument();
    expect(screen.getByText(/50,000円/)).toBeInTheDocument();
    expect(screen.queryByLabelText("月予算（円）")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
  });

  it("owner以外で予算が無ければ「未設定」と表示する", () => {
    myGroup = { role: "member", monthlyBudgetYen: null };
    renderPanel();

    expect(screen.getByText(/未設定/)).toBeInTheDocument();
  });

  it("金額を入力して保存するとmutationへ金額を渡す", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("月予算（円）"), "50000");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(setBudgetMock).toHaveBeenCalledWith({ monthlyBudgetYen: 50000 });
    expect(await screen.findByText("月予算を保存しました")).toBeInTheDocument();
  });

  it("空欄で保存するとnullを渡して解除する", async () => {
    myGroup = { role: "owner", monthlyBudgetYen: 50000 };
    const user = userEvent.setup();
    renderPanel();

    await user.clear(screen.getByLabelText("月予算（円）"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(setBudgetMock).toHaveBeenCalledWith({ monthlyBudgetYen: null });
    expect(await screen.findByText("月予算を解除しました")).toBeInTheDocument();
  });

  it("範囲外の値では保存できない", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("月予算（円）"), "1000000000");

    expect(screen.getByText("0〜999,999,999円の整数で入力してください")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(setBudgetMock).not.toHaveBeenCalled();
  });

  it("保存に失敗したらエラーを通知する", async () => {
    setBudgetMock.mockRejectedValue(new Error("fail"));
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText("月予算（円）"), "50000");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("fail")).toBeInTheDocument();
  });
});
