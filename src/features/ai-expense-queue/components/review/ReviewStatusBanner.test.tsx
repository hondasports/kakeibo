import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewStatusBanner } from "./ReviewStatusBanner";
import type { ReviewChecks } from "../../utils/reviewChecks";
import type { ReviewGuidanceItem } from "../../utils/reviewGuidance";

const matchedChecks: ReviewChecks = {
  amount: { status: "matched", variant: "direct" },
  taxRate: { status: "matched", rows: [] },
};

function renderBanner(
  checks: ReviewChecks,
  issues: ReviewGuidanceItem[] = [],
  receiptIssues: ReviewGuidanceItem[] = [],
  onJump = vi.fn(),
) {
  render(
    <ReviewStatusBanner
      checks={checks}
      issues={issues}
      receiptIssues={receiptIssues}
      busy={false}
      onJump={onJump}
    />,
  );
  return { banner: screen.getByRole("region", { name: "全体の確認状態" }), onJump };
}

describe("ReviewStatusBanner", () => {
  it("すべて一致なら成功メッセージを表示する", () => {
    const { banner } = renderBanner(matchedChecks);
    expect(
      within(banner).getByText(/印字額と明細の金額が一致しています/),
    ).toBeInTheDocument();
  });

  it("金額不一致は差額と確認ボタンを表示する", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const { banner } = renderBanner(
      {
        amount: {
          status: "mismatch",
          variant: "external",
          mismatchStep: "itemsVsSubtotal",
          itemsPrintedTotalYen: 4292,
          printedSubtotalYen: 4300,
          differenceYen: -8,
          focusTarget: "items",
        },
        taxRate: matchedChecks.taxRate,
      },
      [],
      [],
      onJump,
    );
    expect(
      within(banner).getByText("印字額と明細の金額が一致していません"),
    ).toBeInTheDocument();
    expect(within(banner).getByText(/差額 8円/)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "金額を確認する" }));
    expect(onJump).toHaveBeenCalledWith("items");
  });

  it("税率別不一致は行ごとの現在／印字を表示する", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const { banner } = renderBanner(
      {
        amount: matchedChecks.amount,
        taxRate: {
          status: "mismatch",
          rows: [
            {
              taxRatePercent: 8,
              printedYen: 2912,
              currentYen: 0,
              status: "mismatch",
              differenceYen: -2912,
            },
          ],
          focusTarget: "items",
        },
      },
      [],
      [],
      onJump,
    );
    expect(
      within(banner).getByText("税率別の明細合計が一致していません"),
    ).toBeInTheDocument();
    expect(within(banner).getByText(/8%：現在 0円 ／ 印字 2,912円/)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "税率を確認する" }));
    expect(onJump).toHaveBeenCalledWith("items");
  });

  it("比較不能は警告表示し、理由と確認ボタンを出す", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const { banner } = renderBanner(
      {
        amount: matchedChecks.amount,
        taxRate: {
          status: "uncomparable",
          rows: [],
          reason: "割引対象の商品が未確定のため、税率別に集計できません",
          focusTarget: "discount-1",
        },
      },
      [],
      [],
      onJump,
    );
    expect(
      within(banner).getByText("税率別の明細合計を比較できません"),
    ).toBeInTheDocument();
    expect(within(banner).getByText(/割引対象の商品が未確定/)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "税率を確認する" }));
    expect(onJump).toHaveBeenCalledWith("discount-1");
  });

  it("個別の修正・確認項目はリンク付きリストで表示する", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const { banner } = renderBanner(
      matchedChecks,
      [
        {
          id: "discount-1",
          message: "「値引」：割引対象の商品を選択してください。",
          target: "discount-1",
          required: true,
        },
      ],
      [],
      onJump,
    );
    expect(within(banner).getByText(/割引対象の商品を選択/)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "修正箇所へ" }));
    expect(onJump).toHaveBeenCalledWith("discount-1");
  });

  it("レシート全体の確認は情報アラートとして表示する", () => {
    const { banner } = renderBanner(matchedChecks, [], [
      {
        id: "reading",
        message: "レシート全体の読み取り確認です。",
        target: "items",
        required: false,
        scope: "receipt",
      },
    ]);
    expect(within(banner).getByText("レシート全体の確認")).toBeInTheDocument();
    expect(
      within(banner).getByRole("button", { name: "商品一覧を見比べる" }),
    ).toBeInTheDocument();
  });
});
