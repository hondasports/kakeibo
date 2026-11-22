import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { MonthlyInsightCard } from "./MonthlyInsightCard";

const { useQueryMock, useActionMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useActionMock: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useAction: useActionMock,
}));

const insight = {
  commentText: "食費が増えています。",
  source: "ai" as const,
  generatedAt: Date.now() - 60_000,
  generationCount: 1,
};

describe("MonthlyInsightCard", () => {
  it("未生成なら説明文と「コメントを生成」を表示する", () => {
    useQueryMock.mockReturnValue(null);
    useActionMock.mockReturnValue(vi.fn());
    renderWithProviders(<MonthlyInsightCard month="2026-11" />);

    expect(screen.getByText("AI月次インサイト")).toBeInTheDocument();
    expect(screen.getByText("この月の傾向コメントはまだ生成されていません。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "コメントを生成" })).toBeEnabled();
    // 送信するのは集計値のみだと押下前に分かる
    expect(
      screen.getByText(/金額と件数の集計値だけを外部のAIサービスに送ります/),
    ).toBeInTheDocument();
  });

  it("生成済みならコメントと「コメントを再生成」を表示する", () => {
    useQueryMock.mockReturnValue(insight);
    useActionMock.mockReturnValue(vi.fn());
    renderWithProviders(<MonthlyInsightCard month="2026-11" />);

    expect(screen.getByText("食費が増えています。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "コメントを再生成" })).toBeEnabled();
  });

  it("再生成の上限に達すると理由を表示してボタンを無効にする", () => {
    useQueryMock.mockReturnValue({ ...insight, generationCount: 4 });
    useActionMock.mockReturnValue(vi.fn());
    renderWithProviders(<MonthlyInsightCard month="2026-11" />);

    expect(screen.getByText(/再生成の上限（月3回）に達したため/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "コメントを再生成" })).toBeDisabled();
  });

  it("生成中（予約内）はボタンを無効にして「生成しています…」を表示する", () => {
    useQueryMock.mockReturnValue({ ...insight, generatingUntil: Date.now() + 60_000 });
    useActionMock.mockReturnValue(vi.fn());
    renderWithProviders(<MonthlyInsightCard month="2026-11" />);

    expect(screen.getByRole("button", { name: "生成しています…" })).toBeDisabled();
  });

  it("生成ボタンを押すと action を呼ぶ", async () => {
    const generate = vi.fn().mockResolvedValue(undefined);
    useQueryMock.mockReturnValue(null);
    useActionMock.mockReturnValue(generate);
    const user = userEvent.setup();
    renderWithProviders(<MonthlyInsightCard month="2026-11" />);

    await user.click(screen.getByRole("button", { name: "コメントを生成" }));
    expect(generate).toHaveBeenCalledWith({ month: "2026-11" });
  });
});
