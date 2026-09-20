import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCheckCards } from "./ReviewCheckCards";
import type { ReviewAmountCheck, ReviewTaxRateCheck } from "../../utils/reviewChecks";

const amountBase: ReviewAmountCheck = { status: "matched", variant: "direct" };
const taxRateBase: ReviewTaxRateCheck = { status: "matched", rows: [] };

function renderCards(amount: ReviewAmountCheck, taxRate: ReviewTaxRateCheck) {
  render(<ReviewCheckCards amount={amount} taxRate={taxRate} />);
  return screen.getByRole("region", { name: "確認結果" });
}

describe("ReviewCheckCards", () => {
  it("一致時は2枚のカードに一致チップと等式を表示する", () => {
    const region = renderCards(
      { ...amountBase, itemsComparableTotalYen: 4662, paidTotalYen: 4662 },
      {
        ...taxRateBase,
        rows: [
          {
            taxRatePercent: 8,
            taxMode: "included",
            taxableAmountBasis: "tax_included",
            printedYen: 2912,
            currentYen: 2912,
            status: "matched",
            matchKind: "exact",
          },
        ],
      },
    );
    expect(within(region).getAllByText("一致")).toHaveLength(2);
    expect(within(region).getByText(/明細合計 4,662円 ＝ 支払額 4,662円/)).toBeInTheDocument();
    expect(within(region).getByText(/8% 内税/)).toBeInTheDocument();
    expect(within(region).getByText(/現在 2,912円 ／ 印字 2,912円/)).toBeInTheDocument();
  });

  it("外税の一致は 明細合計＋税額＝支払額 で表示する", () => {
    const region = renderCards(
      {
        status: "matched",
        variant: "external",
        itemsPrintedTotalYen: 4292,
        printedTaxYen: 370,
        paidTotalYen: 4662,
        printedSubtotalYen: 4292,
        expectedPaidYen: 4662,
      },
      taxRateBase,
    );
    expect(
      within(region).getByText(/明細合計 4,292円 ＋ 税額 370円 ＝ 支払額 4,662円/),
    ).toBeInTheDocument();
  });

  it("不一致時は確定した差額だけを表示する", () => {
    const region = renderCards(
      {
        status: "mismatch",
        variant: "external",
        mismatchStep: "itemsVsSubtotal",
        itemsPrintedTotalYen: 4292,
        printedSubtotalYen: 4300,
        printedTaxYen: 370,
        paidTotalYen: 4662,
        expectedPaidYen: 4670,
        differenceYen: -8,
      },
      taxRateBase,
    );
    expect(within(region).getByText("不一致")).toBeInTheDocument();
    expect(within(region).getByText("印字小計（税抜）")).toBeInTheDocument();
    expect(within(region).getByText("8円")).toBeInTheDocument();
  });

  it("比較不能は理由を表示し、税率行は対象額未確定を示す", () => {
    const region = renderCards(
      { status: "uncomparable", variant: "direct", reason: "支払額が未確定です" },
      {
        status: "uncomparable",
        rows: [
          {
            taxRatePercent: 8,
            taxMode: "external",
            taxableAmountBasis: "unknown",
            printedYen: 4292,
            status: "uncomparable",
            reason: "対象額の税込／税抜が未確定です",
          },
        ],
        reason: "税率別の対象額が読み取れていません",
      },
    );
    expect(within(region).getAllByText("比較不能")).toHaveLength(2);
    expect(within(region).getByText("支払額が未確定です")).toBeInTheDocument();
    expect(within(region).getByText("対象額の税込／税抜が未確定です")).toBeInTheDocument();
    expect(within(region).getByText(/現在 未確定 ／ 印字 4,292円/)).toBeInTheDocument();
  });

  it("サマリに無い税率は印字なし行として末尾に追加する", () => {
    const region = renderCards(amountBase, {
      status: "uncomparable",
      rows: [
        {
          taxRatePercent: 8,
          taxMode: "external",
          taxableAmountBasis: "tax_excluded",
          printedYen: 100,
          currentYen: 100,
          status: "matched",
          matchKind: "exact",
        },
        {
          taxRatePercent: 10,
          currentYen: 200,
          status: "uncomparable",
          reason: "印字の対象額が読み取れていません",
        },
      ],
    });
    expect(within(region).getByText(/10%（印字なし）/)).toBeInTheDocument();
    expect(within(region).getByText(/現在 200円 ／ 印字 未確定/)).toBeInTheDocument();
  });
});
