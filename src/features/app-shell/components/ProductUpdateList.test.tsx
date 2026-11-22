import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ProductUpdateList } from "./ProductUpdateList";

const sampleUpdates = [
  {
    id: "new-xyz",
    title: "X 機能を追加",
    summary: "XXXXをワンタップで入力できるようになりました。",
    version: "2026.07.11-462",
    publishedAt: "2026-07-11",
    items: ["入力欄を追加", "履歴を表示"],
  },
  {
    id: "new-abc",
    title: "Y 改善",
    summary: "Y の表示を整理しました。",
    version: "2026.07.11-458",
    publishedAt: "2026-07-11",
  },
];

describe("ProductUpdateList", () => {
  test("renders the empty state when there are no updates", () => {
    render(<ProductUpdateList productUpdates={[]} />);

    expect(screen.getByText("まだ公開された更新履歴はありません。")).toBeInTheDocument();
    expect(
      screen.getByText("今後の新機能や改善内容はこちらでお知らせします。"),
    ).toBeInTheDocument();
  });

  test("renders product updates with title, summary, version and published date", () => {
    render(<ProductUpdateList productUpdates={sampleUpdates} />);

    expect(screen.getByRole("heading", { name: "X 機能を追加" })).toBeInTheDocument();
    expect(screen.getByText("XXXXをワンタップで入力できるようになりました。")).toBeInTheDocument();
    expect(screen.getByText("Version 2026.07.11-462")).toBeInTheDocument();
    expect(screen.getAllByText("2026年7月11日")).toHaveLength(2);
  });

  test("renders items as a list", () => {
    render(<ProductUpdateList productUpdates={sampleUpdates} />);

    expect(screen.getByText("入力欄を追加")).toBeInTheDocument();
    expect(screen.getByText("履歴を表示")).toBeInTheDocument();
  });

  test("renders updates in publishedAt descending order", () => {
    render(
      <ProductUpdateList
        productUpdates={[
          {
            id: "older",
            title: "古い更新",
            summary: "古い概要",
            version: "2026.06.01-400",
            publishedAt: "2026-06-01",
          },
          ...sampleUpdates,
          {
            id: "newest",
            title: "新しい更新",
            summary: "新しい概要",
            version: "2026.08.01-500",
            publishedAt: "2026-08-01",
          },
        ]}
      />,
    );

    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["新しい更新", "X 機能を追加", "Y 改善", "古い更新"]);
  });

  test("keeps the original order for updates on the same publishedAt", () => {
    render(<ProductUpdateList productUpdates={sampleUpdates} />);

    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["X 機能を追加", "Y 改善"]);
  });
});
