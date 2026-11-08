import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewCheckCards } from "./ReviewCheckCards";
import { ReviewStatusBanner } from "./ReviewStatusBanner";
import { ReviewDialogActions } from "./ReviewDialogActions";
import { vi } from "vitest";
import type { ReviewAmountCheck } from "../../../../lib/domain/aiExpenseDrafts/reviewAmountChecks";
import type { ReviewCheckStatus } from "../../../../lib/domain/aiExpenseDrafts/reviewCheckUtils";
import type { ReviewTaxRateCheck } from "../../../../lib/domain/aiExpenseDrafts/reviewTaxChecks";

const amountBase: ReviewAmountCheck = { status: "matched", variant: "direct" };
const taxRateBase: ReviewTaxRateCheck = { status: "matched", rows: [] };

function amountCheckOf(status: ReviewCheckStatus): ReviewAmountCheck {
  if (status === "mismatch") {
    return {
      status,
      variant: "direct",
      mismatchStep: "itemsVsPaid",
      itemsComparableTotalYen: 4654,
      paidTotalYen: 4662,
      differenceYen: -8,
    };
  }
  if (status === "uncomparable") {
    return { status, variant: "direct", reason: "支払額が未確定です" };
  }
  return { ...amountBase, itemsComparableTotalYen: 4662, paidTotalYen: 4662 };
}

function taxRateCheckOf(status: ReviewCheckStatus): ReviewTaxRateCheck {
  if (status === "mismatch") {
    return {
      status,
      rows: [
        {
          taxRatePercent: 10,
          taxMode: "included",
          taxableAmountBasis: "tax_included",
          printedYen: 220,
          currentYen: 110,
          status: "mismatch",
          differenceYen: -110,
        },
      ],
    };
  }
  if (status === "uncomparable") {
    return {
      status,
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
    };
  }
  return {
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
  };
}

describe("ReviewCheckCards", () => {
  it.each<[ReviewCheckStatus, ReviewCheckStatus, string[]]>([
    ["matched", "matched", []],
    ["matched", "mismatch", ["金額確認", "税率別集計"]],
    ["matched", "uncomparable", ["金額確認", "税率別集計"]],
    ["mismatch", "matched", ["金額確認"]],
    ["uncomparable", "matched", ["金額確認"]],
    ["mismatch", "mismatch", ["金額確認", "税率別集計"]],
    ["mismatch", "uncomparable", ["金額確認", "税率別集計"]],
    ["uncomparable", "mismatch", ["金額確認", "税率別集計"]],
    ["uncomparable", "uncomparable", ["金額確認", "税率別集計"]],
  ])(
    "金額確認=%s・税率別集計=%s のとき %s を表示する",
    (amountStatus, taxRateStatus, expectedTitles) => {
      render(
        <ReviewCheckCards
          amount={amountCheckOf(amountStatus)}
          taxRate={taxRateCheckOf(taxRateStatus)}
        />,
      );
      const region = screen.queryByRole("region", { name: "確認結果" });
      if (expectedTitles.length === 0) {
        expect(region).not.toBeInTheDocument();
        return;
      }
      expect(region).toBeInTheDocument();
      for (const title of ["金額確認", "税率別集計"]) {
        if (expectedTitles.includes(title)) {
          expect(within(region!).getByText(title)).toBeVisible();
        } else {
          expect(within(region!).queryByText(title)).not.toBeInTheDocument();
        }
      }
    },
  );

  it("金額と税率別の両方が比較不能なら両方を表示する", () => {
    render(
      <ReviewCheckCards
        amount={amountCheckOf("uncomparable")}
        taxRate={taxRateCheckOf("uncomparable")}
      />,
    );
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getAllByRole("heading", { level: 4 })).toHaveLength(2);
    expect(within(region).getByText("税率別集計")).toBeVisible();
  });

  it("編集で一致・不一致が変わると各カードの表示が追随する", () => {
    const { rerender } = render(
      <ReviewCheckCards amount={amountCheckOf("matched")} taxRate={taxRateCheckOf("matched")} />,
    );
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();

    rerender(
      <ReviewCheckCards amount={amountCheckOf("mismatch")} taxRate={taxRateCheckOf("matched")} />,
    );
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("金額確認")).toBeVisible();
    expect(within(region).queryByText("税率別集計")).not.toBeInTheDocument();

    rerender(
      <ReviewCheckCards amount={amountCheckOf("matched")} taxRate={taxRateCheckOf("matched")} />,
    );
    expect(screen.queryByRole("region", { name: "確認結果" })).not.toBeInTheDocument();
  });

  it("金額の状態を各状態で一つのライブ領域に通知する", () => {
    function view(
      amountStatus: ReviewCheckStatus,
      taxStatus: ReviewCheckStatus,
      hasIssues = false,
    ) {
      const amount = amountCheckOf(amountStatus);
      const taxRate = taxRateCheckOf(taxStatus);
      return (
        <>
          <ReviewStatusBanner
            checks={{ amount, taxRate }}
            issues={
              hasIssues
                ? [{ id: "required", message: "修正してください", target: "items", required: true }]
                : []
            }
            unresolvedTaxItemCount={0}
            busy={false}
            onJump={vi.fn()}
          />
          <ReviewCheckCards amount={amount} taxRate={taxRate} />
          <ReviewDialogActions
            reviewError=""
            busy={false}
            requiredCount={hasIssues ? 1 : 0}
            checkMismatchCount={amountStatus === "mismatch" || taxStatus === "mismatch" ? 1 : 0}
            recommendationCount={
              taxStatus === "uncomparable" || amountStatus === "uncomparable" ? 1 : 0
            }
            totalOnly={false}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
            onReviewRequired={vi.fn()}
          />
        </>
      );
    }
    const amountLives = () =>
      [...document.querySelectorAll('[role="alert"], [role="status"], [aria-live]')].filter(
        (element) =>
          /金額が8円合いません|8円合いません|金額を比較できません|金額と支払額が一致|印字額と明細の金額が一致|計算した金額が一致/.test(
            element.textContent ?? "",
          ),
      );
    const { rerender } = render(view("mismatch", "matched"));
    expect(amountLives()).toHaveLength(1);
    expect(amountLives()[0]).toHaveTextContent("8円");
    rerender(view("uncomparable", "matched"));
    expect(amountLives()).toHaveLength(1);
    rerender(view("matched", "uncomparable"));
    expect(amountLives()).toHaveLength(1);
    rerender(view("matched", "matched"));
    expect(amountLives()).toHaveLength(1);
    rerender(view("matched", "matched", true));
    expect(amountLives()).toHaveLength(1);
  });

  it("税率別だけ未一致なら金額一致の表示を維持する", () => {
    render(
      <ReviewCheckCards
        amount={amountCheckOf("matched")}
        taxRate={taxRateCheckOf("uncomparable")}
      />,
    );
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(region).not.toHaveAttribute("aria-live");
    const live = region.querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent("商品の金額と支払額が一致しています");
    expect(live).not.toHaveTextContent("税率別集計");
  });

  it("不一致時は確定した差額だけを表示する", () => {
    render(
      <ReviewCheckCards
        amount={{
          status: "mismatch",
          variant: "external",
          mismatchStep: "itemsVsSubtotal",
          itemsPrintedTotalYen: 4292,
          printedSubtotalYen: 4300,
          printedTaxYen: 370,
          paidTotalYen: 4662,
          expectedPaidYen: 4670,
          differenceYen: -8,
        }}
        taxRate={taxRateCheckOf("matched")}
      />,
    );
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText("不一致")).toBeInTheDocument();
    expect(within(region).getByText("印字小計（税抜）")).toBeInTheDocument();
    expect(within(region).getByText("8円")).toBeInTheDocument();
  });

  it("比較不能は理由を表示し、税率行は対象額未確定を示す", () => {
    render(
      <ReviewCheckCards
        amount={amountCheckOf("uncomparable")}
        taxRate={taxRateCheckOf("uncomparable")}
      />,
    );
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getAllByText("比較不能")).toHaveLength(2);
    expect(within(region).getByText("支払額が未確定です")).toBeInTheDocument();
    expect(within(region).getByText("対象額の税込／税抜が未確定です")).toBeInTheDocument();
    expect(within(region).getByText(/現在 未確定 ／ 対象額 4,292円/)).toBeInTheDocument();
  });

  it("サマリに無い税率は印字なし行として末尾に追加する", () => {
    render(
      <ReviewCheckCards
        amount={amountCheckOf("matched")}
        taxRate={{
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
        }}
      />,
    );
    const region = screen.getByRole("region", { name: "確認結果" });
    expect(within(region).getByText(/10%（印字なし）/)).toBeInTheDocument();
    expect(within(region).getByText(/現在 200円 ／ 対象額 未確定/)).toBeInTheDocument();
  });
});
