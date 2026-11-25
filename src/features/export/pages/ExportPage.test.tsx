import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { apiMockWith } from "../../../test/apiMock";
import { renderWithProviders } from "../../../test/render";
import { ExportPage } from "./ExportPage";

const queryMock = vi.fn();
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: queryMock }),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: apiMockWith({
    "dataExport.listExportEntries": "list-export-entries",
  }),
}));

const sampleRow = {
  date: "2026-01-10",
  kind: "expense",
  title: "スーパー",
  categoryName: "食費",
  amountYen: 1234,
  memo: "",
};

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <ExportPage />
    </MemoryRouter>,
  );
}

function setRange(start: string, end: string) {
  fireEvent.change(screen.getByLabelText("開始日"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("終了日"), { target: { value: end } });
}

async function selectEntryType(user: ReturnType<typeof userEvent.setup>, optionName: string) {
  await user.click(screen.getByRole("combobox", { name: "対象データ" }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("ExportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom は createObjectURL を持たないため差し替える。download自体はE2Eで検証する。
    URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    queryMock.mockResolvedValue({ groupId: "g1", rows: [sampleRow], truncated: false });
  });

  it("種別・期間がクエリ引数に反映され、件数とファイル名を表示する", async () => {
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-05", "2026-01-20");
    await selectEntryType(user, "支出のみ");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    expect(
      await screen.findByText("1件をsuzumemo-export-20260105-20260120.csvとして保存しました"),
    ).toBeInTheDocument();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith("list-export-entries", {
      startDate: "2026-01-05",
      endDate: "2026-01-20",
      entryType: "expense",
      expectedGroupId: undefined,
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it("月をまたぐ期間は月ごとに分割し、2回目以降に1回目のgroupIdを渡す", async () => {
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-15", "2026-03-10");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    // 3件（1か月ごとに1件の行）で完了するまで待つ
    expect(
      await screen.findByText("3件をsuzumemo-export-20260115-20260310.csvとして保存しました"),
    ).toBeInTheDocument();
    expect(queryMock).toHaveBeenCalledTimes(3);
    // entryType は「支出と収入」（all）なら undefined になる
    expect(queryMock).toHaveBeenNthCalledWith(1, "list-export-entries", {
      startDate: "2026-01-15",
      endDate: "2026-01-31",
      entryType: undefined,
      expectedGroupId: undefined,
    });
    expect(queryMock).toHaveBeenNthCalledWith(2, "list-export-entries", {
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      entryType: undefined,
      expectedGroupId: "g1",
    });
    expect(queryMock).toHaveBeenNthCalledWith(3, "list-export-entries", {
      startDate: "2026-03-01",
      endDate: "2026-03-10",
      entryType: undefined,
      expectedGroupId: "g1",
    });
  });

  it("明細が0件ならその旨を表示し、ダウンロードしない", async () => {
    queryMock.mockResolvedValue({ groupId: "g1", rows: [], truncated: false });
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-05", "2026-01-20");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    expect(await screen.findByText("指定期間の明細はありませんでした")).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("上限超過（truncated）なら月を示したエラーを表示する", async () => {
    queryMock.mockResolvedValue({ groupId: "g1", rows: [], truncated: true });
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-05", "2026-01-20");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    expect(
      await screen.findByText(
        "2026-01 の明細が1か月あたりの上限を超えています。期間を短くして再度お試しください",
      ),
    ).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("Errorのmessageがある失敗ではそのmessageを表示する", async () => {
    queryMock.mockRejectedValue(new Error("書き出し中に利用グループが変更されました"));
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-05", "2026-01-20");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    expect(await screen.findByText("書き出し中に利用グループが変更されました")).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("messageが無い失敗では既定文言を表示する", async () => {
    queryMock.mockRejectedValue(new Error(""));
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-05", "2026-01-20");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    expect(await screen.findByText("データの書き出しに失敗しました")).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("2回目の取得だけ失敗してもダウンロードしない", async () => {
    queryMock
      .mockResolvedValueOnce({ groupId: "g1", rows: [sampleRow], truncated: false })
      .mockRejectedValueOnce(new Error("2回目だけ失敗"));
    const user = userEvent.setup();
    renderPage();
    setRange("2026-01-15", "2026-03-10");

    await user.click(screen.getByRole("button", { name: "CSVをダウンロード" }));

    expect(await screen.findByText("2回目だけ失敗")).toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("開始日が終了日より後なら実行できない", () => {
    renderPage();
    setRange("2026-02-10", "2026-02-01");

    expect(screen.getByText("開始日は終了日以前の日付を指定してください")).toBeInTheDocument();
    // disabled のためクリック自体が発生しない（userEvent も拒否する）。
    // disabled であることと、クエリが発行されないことを確認する。
    expect(screen.getByRole("button", { name: "CSVをダウンロード" })).toBeDisabled();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
