import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { MemoryRouter } from "react-router-dom";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithProviders } from "../../../test/render";
import { RecurringDueSection } from "./RecurringDueSection";

const useQueryMock = vi.fn();
const registerMock = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (endpoint: unknown) => (endpoint === "register-from-rule" ? registerMock : vi.fn()),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "recurringRules.index.listRecurringRules": "list-rules",
    "recurringRules.index.registerFromRecurringRule": "register-from-rule",
  }),
}));

function makeRule(
  fields: Omit<Partial<Doc<"recurringEntryRules">>, "_id"> & { _id: string },
): Doc<"recurringEntryRules"> {
  return {
    _creationTime: 1,
    groupId: "g1" as Doc<"recurringEntryRules">["groupId"],
    kind: "expense",
    title: "家賃",
    amountYen: 80000,
    frequency: "monthly",
    dayOfMonth: 1,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...fields,
  } as Doc<"recurringEntryRules">;
}

// 固定時計: 2026-06-04 12:00 JST（木曜日）。today = "2026-06-04"
const FIXED_NOW = new Date("2026-06-04T03:00:00Z");

// monthly 1日・active・未登録 → 発生日 2026-06-01 で期日到来
const dueMonthly = makeRule({ _id: "rule-due-monthly", title: "家賃", amountYen: 80000 });
// weekly 木曜(4)・active・未登録 → 発生日 2026-06-04（当日）で期日到来
const dueWeekly = makeRule({
  _id: "rule-due-weekly",
  title: "週次の仕入れ",
  amountYen: 1234,
  frequency: "weekly",
  dayOfWeek: 4,
  dayOfMonth: undefined,
});
// 同じ発生日を登録済み → 期日ではない
const alreadyRegistered = makeRule({
  _id: "rule-registered",
  title: "登録済みの定義",
  registeredForDates: ["2026-06-01"],
});
// 停止中 → 期日ではない
const inactive = makeRule({ _id: "rule-inactive", title: "停止中の定義", active: false });

let rules: unknown;
function renderSection() {
  useQueryMock.mockImplementation((endpoint: unknown) =>
    endpoint === "list-rules" ? rules : undefined,
  );
  return renderWithProviders(
    <MemoryRouter>
      <RecurringDueSection />
    </MemoryRouter>,
  );
}

describe("RecurringDueSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMock.mockResolvedValue({ registered: true, date: "2026-06-01" });
    rules = [dueMonthly];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("読込中は何も表示しない", () => {
    rules = undefined;
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it("期日の来た定義だけを表示する", () => {
    rules = [dueMonthly, dueWeekly, alreadyRegistered, inactive];
    renderSection();

    expect(screen.getByText("期日が来た定期定義")).toBeInTheDocument();
    expect(screen.getByText("支出・家賃・80,000円")).toBeInTheDocument();
    expect(screen.getByText("支出・週次の仕入れ・1,234円")).toBeInTheDocument();
    expect(screen.getByText("毎月1日")).toBeInTheDocument();
    expect(screen.getByText("毎週木曜日")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026-06-01分を登録" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026-06-04分を登録" })).toBeInTheDocument();
    // 登録済み・停止中は出さない
    expect(screen.queryByText(/登録済みの定義/)).not.toBeInTheDocument();
    expect(screen.queryByText(/停止中の定義/)).not.toBeInTheDocument();
  });

  it("登録ボタンでruleIdをmutationへ渡し、登録日付のメッセージを表示する", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "2026-06-01分を登録" }));

    expect(registerMock).toHaveBeenCalledWith({ ruleId: "rule-due-monthly" });
    expect(
      await screen.findByText("支出「家賃」を2026-06-01の記録として登録しました"),
    ).toBeInTheDocument();
  });

  it("登録済みだったときはその旨を表示する", async () => {
    registerMock.mockResolvedValue({ registered: false, reason: "already_registered" });
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "2026-06-01分を登録" }));

    expect(await screen.findByText("この定期定義はすでに登録済みです")).toBeInTheDocument();
  });

  it("登録に失敗したらエラーを表示する", async () => {
    registerMock.mockRejectedValue(new Error("登録に失敗しました"));
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "2026-06-01分を登録" }));

    expect(await screen.findByText("登録に失敗しました")).toBeInTheDocument();
  });
});
