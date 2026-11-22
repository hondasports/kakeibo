import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useActionMock } = vi.hoisted(() => ({ useActionMock: vi.fn() }));
vi.mock("convex/react", () => ({ useAction: useActionMock }));

import { SystemAdminUserSearchPage } from "./SystemAdminUserSearchPage";

describe("SystemAdminUserSearchPage", () => {
  const actionMock = vi.fn();

  beforeEach(() => {
    actionMock.mockReset();
    actionMock.mockResolvedValue({
      environment: "preview",
      page: [
        {
          id: "user-document-1",
          userId: "target-user",
          displayName: "対象ユーザー",
          email: "target@example.test",
          activeGroupId: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      isDone: true,
      continueCursor: "",
    });
    useActionMock.mockReturnValue(actionMock);
  });

  it("検索 actionを使い、管理情報だけの結果を表示する", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SystemAdminUserSearchPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByRole("textbox", { name: "ユーザー検索" }), "対象");
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(await screen.findByText("対象ユーザー")).toBeInTheDocument();
    expect(screen.getByText("target@example.test")).toBeInTheDocument();
    expect(screen.queryByText(/金額|支出|収入|レシート/)).not.toBeInTheDocument();
    expect(actionMock).toHaveBeenCalledWith({
      queryType: "displayName",
      query: "対象",
      paginationOpts: { numItems: 20, cursor: null },
    });
  });

  it("次のページの取得に失敗しても再試行で同じページを取得し、前のページに戻れる", async () => {
    const user = userEvent.setup();
    const firstPageUser = {
      id: "user-document-1",
      userId: "target-user",
      displayName: "対象ユーザー",
      email: "target@example.test",
      activeGroupId: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const secondPageUser = {
      ...firstPageUser,
      id: "user-document-21",
      displayName: "21番目のユーザー",
    };
    actionMock
      .mockResolvedValueOnce({
        environment: "preview",
        page: [firstPageUser],
        isDone: false,
        continueCursor: "cursor-page-2",
      })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        environment: "preview",
        page: [secondPageUser],
        isDone: true,
        continueCursor: "",
      });
    render(
      <MemoryRouter>
        <SystemAdminUserSearchPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "検索" }));
    expect(await screen.findByText("対象ユーザー")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "次のページ" }));
    expect(await screen.findByText(/管理情報を読み込めませんでした/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("21番目のユーザー")).toBeInTheDocument();
    expect(screen.getByText("21〜21件目を表示")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前のページ" })).toBeInTheDocument();
    // 失敗したリクエストと同じカーソル・同じ条件で再発行される。
    for (const callIndex of [2, 3]) {
      expect(actionMock).toHaveBeenNthCalledWith(callIndex, {
        queryType: "displayName",
        query: "",
        paginationOpts: { numItems: 20, cursor: "cursor-page-2" },
      });
    }
  });

  it("検索条件が未入力でも条件なし検索を実行する", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SystemAdminUserSearchPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "検索" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(await screen.findByText("対象ユーザー")).toBeInTheDocument();
    expect(actionMock).toHaveBeenCalledWith({
      queryType: "displayName",
      query: "",
      paginationOpts: { numItems: 20, cursor: null },
    });
  });
});
