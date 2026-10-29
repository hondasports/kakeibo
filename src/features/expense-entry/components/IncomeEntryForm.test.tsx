import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIncomeEntry } from "../hooks/useIncomeEntry";
import { IncomeEntryForm } from "./IncomeEntryForm";

const { createIncomeEntry } = vi.hoisted(() => ({ createIncomeEntry: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => createIncomeEntry }));

function Form() {
  const income = useIncomeEntry("2026-06-02");
  return (
    <IncomeEntryForm
      {...income}
      date="2026-06-02"
      setDate={vi.fn()}
      weekStartDate="2026-06-02"
      weekEndDate="2026-06-08"
    />
  );
}

describe("IncomeEntryForm", () => {
  beforeEach(() => {
    createIncomeEntry.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ["-100", "100", 100],
    ["1.5", "15", 15],
    ["320,000", "320,000", 320000],
    ["9,999,999", "9,999,999", 9999999],
  ])("入力 %s を表示 %s と同じ金額で保存する", async (input, display, amountYen) => {
    render(<Form />);
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: input } });
    expect(screen.getByLabelText("金額")).toHaveValue(display);
    fireEvent.change(screen.getByLabelText("収入の内容・メモ"), {
      target: { value: `  ${"給".repeat(100)}  ` },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存して次へ" }));
    await waitFor(() =>
      expect(createIncomeEntry).toHaveBeenCalledWith({
        date: "2026-06-02",
        amountYen,
        title: "給".repeat(100),
      }),
    );
    expect(screen.getByLabelText("金額")).toHaveValue("");
    expect(screen.getByLabelText("収入の内容・メモ")).toHaveValue("");
  });

  it.each([
    ["", "給与", "金額", "金額は必須です"],
    ["0", "給与", "金額", "金額は 1 円以上です"],
    ["10000000", "給与", "金額", "金額は 9,999,999 円以下です"],
    ["100", "   ", "収入の内容・メモ", "内容は必須です"],
    ["100", "給".repeat(101), "収入の内容・メモ", "内容は 100 文字以内です"],
  ])("金額 %s・内容の不正を該当欄で示して送信しない", (amount, title, field, message) => {
    render(<Form />);
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText("収入の内容・メモ"), { target: { value: title } });
    fireEvent.click(screen.getByRole("button", { name: "保存して次へ" }));
    expect(screen.getByLabelText(field)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(createIncomeEntry).not.toHaveBeenCalled();
  });
});
