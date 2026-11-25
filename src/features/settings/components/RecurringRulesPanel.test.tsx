import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithProviders } from "../../../test/render";
import { RecurringRulesPanel } from "./RecurringRulesPanel";

const useQueryMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const setActiveMock = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (endpoint: unknown) => {
    if (endpoint === "create-rule") return createMock;
    if (endpoint === "update-rule") return updateMock;
    if (endpoint === "set-rule-active") return setActiveMock;
    return vi.fn();
  },
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "recurringRules.index.listRecurringRules": "list-rules",
    "recurringRules.index.createRecurringRule": "create-rule",
    "recurringRules.index.updateRecurringRule": "update-rule",
    "recurringRules.index.setRecurringRuleActive": "set-rule-active",
    "categories.queries.listActive": "categories-list-active",
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
    categoryId: "cat-food" as Doc<"recurringEntryRules">["categoryId"],
    frequency: "monthly",
    dayOfMonth: 25,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...fields,
  } as Doc<"recurringEntryRules">;
}

let rules: unknown;
function renderPanel() {
  useQueryMock.mockImplementation((endpoint: unknown) => {
    if (endpoint === "list-rules") return rules;
    if (endpoint === "categories-list-active") {
      return [
        { _id: "cat-food", name: "食費", isActive: true },
        { _id: "cat-transport", name: "交通費", isActive: true },
      ];
    }
    return undefined;
  });
  return renderWithProviders(<RecurringRulesPanel />);
}

async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "追加" }));
  return await screen.findByRole("dialog");
}

describe("RecurringRulesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue("new-rule-id");
    updateMock.mockResolvedValue(null);
    setActiveMock.mockResolvedValue(null);
    rules = [];
  });

  it("読込中は読み込み表示にする", () => {
    rules = undefined;
    renderPanel();
    expect(screen.getByText("読み込んでいます…")).toBeInTheDocument();
  });

  it("空なら空の案内を表示する", () => {
    renderPanel();
    expect(screen.getByText("定期定義はまだありません。")).toBeInTheDocument();
  });

  it("定義の一覧とスケジュールを表示する", () => {
    rules = [makeRule({ _id: "rule-1" })];
    renderPanel();

    expect(screen.getByText("支出・家賃・80,000円")).toBeInTheDocument();
    expect(screen.getByText("毎月25日")).toBeInTheDocument();
  });

  it("毎月の定義を作成するときの引数", async () => {
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText(/項目名/), "家賃");
    await user.type(within(dialog).getByLabelText(/金額（円）/), "80000");
    await user.click(within(dialog).getByRole("combobox", { name: "カテゴリ" }));
    await user.click(await screen.findByRole("option", { name: "食費" }));
    const dayInput = within(dialog).getByLabelText(/日付（1〜31）/);
    await user.clear(dayInput);
    await user.type(dayInput, "25");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(createMock).toHaveBeenCalledWith({
      kind: "expense",
      title: "家賃",
      amountYen: 80000,
      categoryId: "cat-food",
      shopName: undefined,
      memo: undefined,
      frequency: "monthly",
      dayOfWeek: undefined,
      dayOfMonth: 25,
    });
  });

  it("毎週の定義を作成するときの引数", async () => {
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText(/項目名/), "週次の仕入れ");
    await user.type(within(dialog).getByLabelText(/金額（円）/), "1234");
    await user.click(within(dialog).getByRole("combobox", { name: "カテゴリ" }));
    await user.click(await screen.findByRole("option", { name: "食費" }));
    await user.click(within(dialog).getByRole("button", { name: "毎週" }));
    await user.click(within(dialog).getByRole("combobox", { name: "曜日" }));
    await user.click(await screen.findByRole("option", { name: "水曜日" }));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(createMock).toHaveBeenCalledWith({
      kind: "expense",
      title: "週次の仕入れ",
      amountYen: 1234,
      categoryId: "cat-food",
      shopName: undefined,
      memo: undefined,
      frequency: "weekly",
      dayOfWeek: 3,
      dayOfMonth: undefined,
    });
  });

  it("収入ではカテゴリを渡さない", async () => {
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.click(within(dialog).getByRole("button", { name: "収入" }));
    await user.type(within(dialog).getByLabelText(/項目名/), "給料");
    await user.type(within(dialog).getByLabelText(/金額（円）/), "300000");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(createMock).toHaveBeenCalledWith({
      kind: "income",
      title: "給料",
      amountYen: 300000,
      categoryId: undefined,
      shopName: undefined,
      memo: undefined,
      frequency: "monthly",
      dayOfWeek: undefined,
      dayOfMonth: 1,
    });
  });

  it("編集では既存の値が入り、ruleIdつきで更新する", async () => {
    rules = [makeRule({ _id: "rule-1" })];
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "編集" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/項目名/)).toHaveValue("家賃");
    expect(within(dialog).getByLabelText(/金額（円）/)).toHaveValue("80000");

    const titleInput = within(dialog).getByLabelText(/項目名/);
    await user.clear(titleInput);
    await user.type(titleInput, "更新後の家賃");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(updateMock).toHaveBeenCalledWith({
      ruleId: "rule-1",
      kind: "expense",
      title: "更新後の家賃",
      amountYen: 80000,
      categoryId: "cat-food",
      shopName: undefined,
      memo: undefined,
      frequency: "monthly",
      dayOfWeek: undefined,
      dayOfMonth: 25,
    });
  });

  it("停止・再開でsetActiveを呼ぶ", async () => {
    rules = [
      makeRule({ _id: "rule-active", title: "家賃" }),
      makeRule({ _id: "rule-inactive", title: "停止中のもの", active: false }),
    ];
    const user = userEvent.setup();
    renderPanel();

    const activeRow = screen.getByText("支出・家賃・80,000円").closest("li") as HTMLElement;
    await user.click(within(activeRow).getByRole("button", { name: "停止" }));
    expect(setActiveMock).toHaveBeenCalledWith({ ruleId: "rule-active", active: false });

    const inactiveRow = screen
      .getByText("支出・停止中のもの・80,000円")
      .closest("li") as HTMLElement;
    expect(within(inactiveRow).getByText("毎月25日（停止中）")).toBeInTheDocument();
    await user.click(within(inactiveRow).getByRole("button", { name: "再開" }));
    expect(setActiveMock).toHaveBeenCalledWith({ ruleId: "rule-inactive", active: true });
  });

  it("項目名が空なら保存できない", async () => {
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText(/金額（円）/), "80000");
    await user.click(within(dialog).getByRole("combobox", { name: "カテゴリ" }));
    await user.click(await screen.findByRole("option", { name: "食費" }));

    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("支出でカテゴリ未選択なら保存できない", async () => {
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText(/項目名/), "家賃");
    await user.type(within(dialog).getByLabelText(/金額（円）/), "80000");

    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("Errorのmessageがある失敗ではそのmessageをダイアログに表示する", async () => {
    createMock.mockRejectedValue(new Error("定期定義の保存が混雑しています"));
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText(/項目名/), "家賃");
    await user.type(within(dialog).getByLabelText(/金額（円）/), "80000");
    await user.click(within(dialog).getByRole("combobox", { name: "カテゴリ" }));
    await user.click(await screen.findByRole("option", { name: "食費" }));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByText("定期定義の保存が混雑しています")).toBeInTheDocument();
  });

  it("Error以外の失敗では既定文言をダイアログに表示する", async () => {
    createMock.mockRejectedValue("plain failure");
    const user = userEvent.setup();
    renderPanel();
    const dialog = await openCreateDialog(user);

    await user.type(within(dialog).getByLabelText(/項目名/), "家賃");
    await user.type(within(dialog).getByLabelText(/金額（円）/), "80000");
    await user.click(within(dialog).getByRole("combobox", { name: "カテゴリ" }));
    await user.click(await screen.findByRole("option", { name: "食費" }));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));

    expect(await within(dialog).findByText("保存に失敗しました")).toBeInTheDocument();
  });
});
