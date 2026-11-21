import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { renderWithProviders } from "../../../test/render";
import { ReviewDialogBasicsSection } from "./ReviewDialogBasicsSection";
import type { ReviewFormValues } from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";

const validForm: ReviewFormValues = {
  documentType: "receipt",
  shopName: "ジャパン",
  date: "2026-08-06",
  amountYen: "92",
  categoryId: "food",
  registrationMode: "detailed",
};

const categories = [{ _id: "food", name: "食費", color: "#886644" }];

function renderSection(form: Partial<ReviewFormValues> = {}, documentOpen = true) {
  const props: ComponentProps<typeof ReviewDialogBasicsSection> = {
    form: { ...validForm, ...form },
    categories,
    documentOpen,
    busy: false,
    register: () => () => {},
    onToggleDocument: vi.fn(),
    onFieldChange: vi.fn(),
  };
  return renderWithProviders(<ReviewDialogBasicsSection {...props} />);
}

function expectDescribedByMessage(control: HTMLElement, message: string) {
  const describedBy = control.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  const description = describedBy
    ?.split(" ")
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .map((element) => element?.textContent)
    .join(" ");
  expect(description).toContain(message);
}

describe("ReviewDialogBasicsSection", () => {
  it("未入力の項目に修正方法が分かる文言を表示し、項目と関連付ける", () => {
    renderSection({
      shopName: "",
      amountYen: "",
      categoryId: "",
      documentType: "unknown",
    });

    const shopName = screen.getByRole("textbox", { name: "店名・内容" });
    expect(shopName).toHaveAttribute("aria-invalid", "true");
    expectDescribedByMessage(shopName, "店名・内容を入力してください。");

    const amount = screen.getByRole("textbox", { name: "合計金額" });
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expectDescribedByMessage(amount, "合計金額を1円以上で入力してください。");

    const category = screen.getByRole("combobox", { name: "レシート全体のカテゴリ" });
    expectDescribedByMessage(category, "レシート全体のカテゴリを選択してください。");

    const documentType = screen.getByRole("combobox", { name: "書類種別" });
    expectDescribedByMessage(documentType, "書類種別を選択してください。");
  });

  it("合計金額が0のときもエラー文言を表示する", () => {
    renderSection({ amountYen: "0" });
    const amount = screen.getByRole("textbox", { name: "合計金額" });
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expectDescribedByMessage(amount, "合計金額を1円以上で入力してください。");
  });

  it("合計金額が上限を超えるときは上限の文言を表示する", () => {
    renderSection({ amountYen: "10000000" });
    const amount = screen.getByRole("textbox", { name: "合計金額" });
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expectDescribedByMessage(amount, "9,999,999 円以下");
  });

  it("正常入力ではエラー文言を表示しない", () => {
    renderSection();
    expect(screen.getByRole("textbox", { name: "店名・内容" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "合計金額" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByText("店名・内容を入力してください。")).not.toBeInTheDocument();
    expect(screen.queryByText("合計金額を1円以上で入力してください。")).not.toBeInTheDocument();
    expect(
      screen.queryByText("レシート全体のカテゴリを選択してください。"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("書類種別を選択してください。")).not.toBeInTheDocument();
  });
});
