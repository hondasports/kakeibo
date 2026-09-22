import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewStatusBanner } from "./ReviewStatusBanner";
import type { ReviewChecks } from "../utils/reviewChecks";
import type { ReviewGuidanceItem } from "../utils/reviewGuidance";

const matchedChecks: ReviewChecks = {
  amount: { status: "matched", variant: "direct" },
  taxRate: { status: "matched", rows: [] },
};

function renderBanner(
  checks: ReviewChecks,
  issues: ReviewGuidanceItem[] = [],
  unresolvedTaxItemCount = 0,
  onJump = vi.fn(),
) {
  render(
    <ReviewStatusBanner
      checks={checks}
      issues={issues}
      unresolvedTaxItemCount={unresolvedTaxItemCount}
      busy={false}
      onJump={onJump}
    />,
  );
  return { banner: screen.getByRole("region", { name: "全体の確認状態" }), onJump };
}

describe("ReviewStatusBanner", () => {
  it("すべて一致なら成功メッセージを表示する", () => {
    const { banner } = renderBanner(matchedChecks);
    expect(within(banner).getByText(/印字額と明細の金額が一致しています/)).toBeInTheDocument();
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
      0,
      onJump,
    );
    expect(within(banner).getByText("印字額と明細の金額が一致していません")).toBeInTheDocument();
    expect(within(banner).getByText(/差額 8円/)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "金額を確認する" }));
    expect(onJump).toHaveBeenCalledWith("items");
  });

  it("税率設定の不一致は修正対象だけを案内する", async () => {
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
      0,
      onJump,
    );
    expect(within(banner).getByText("商品の税率を確認してください")).toBeInTheDocument();
    expect(
      within(banner).getByText(/レシートの税内訳と、商品の税率設定が一致/),
    ).toBeInTheDocument();
    expect(within(banner).queryByText(/税率別の明細合計/)).not.toBeInTheDocument();
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
      0,
      onJump,
    );
    expect(within(banner).getByText("商品の税率を確認してください")).toBeInTheDocument();
    expect(within(banner).getByText(/税率または税込／税抜設定/)).toBeInTheDocument();
    expect(within(banner).queryByText(/税率別の明細合計/)).not.toBeInTheDocument();
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
      0,
      onJump,
    );
    expect(within(banner).getByText(/割引対象の商品を選択/)).toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "修正箇所へ" }));
    expect(onJump).toHaveBeenCalledWith("discount-1");
  });

  it("金額と税率別集計が一致していれば成功メッセージだけを表示する", () => {
    const { banner } = renderBanner(matchedChecks);
    expect(within(banner).queryByText("レシート全体の確認")).not.toBeInTheDocument();
    expect(within(banner).getByText(/印字額と明細の金額が一致しています/)).toBeInTheDocument();
  });

  it("税率未確定による比較不能は1つの案内にまとめる", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const { banner } = renderBanner(
      {
        amount: {
          status: "uncomparable",
          variant: "direct",
          reason: "税率が未確定です",
          blockerCode: "unresolved-tax",
          affectedItemIds: ["item-1", "item-2", "item-3"],
          focusTarget: "item-1",
        },
        taxRate: {
          status: "uncomparable",
          rows: [],
          reason: "税率が未確定です",
          blockerCode: "unresolved-tax",
          affectedItemIds: ["item-1", "item-2", "item-3"],
          focusTarget: "item-1",
        },
      },
      [],
      3,
      onJump,
    );
    expect(
      within(banner).getByText("税率・税込／税抜が未確定の商品があります"),
    ).toBeInTheDocument();
    expect(within(banner).getByText(/未確定の商品が3件/)).toBeInTheDocument();
    expect(within(banner).queryByText("レシート全体の確認")).not.toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "未確定の商品を確認する" }));
    expect(onJump).toHaveBeenCalledWith("item-1");
  });

  it("税込／税抜の矛盾による比較不能は1つの案内にまとめる", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    const conflict = {
      status: "uncomparable" as const,
      reason: "商品の税込／税抜設定が、レシートの税内訳と一致していません",
      blockerCode: "basis-conflict" as const,
      affectedItemIds: ["item-1", "item-2"],
      focusTarget: "item-1",
    };
    const { banner } = renderBanner(
      {
        amount: { ...conflict, variant: "direct" },
        taxRate: { ...conflict, rows: [] },
      },
      [],
      0,
      onJump,
    );
    expect(
      within(banner).getByText("商品の税込／税抜設定が、レシートの税内訳と一致していません"),
    ).toBeInTheDocument();
    expect(within(banner).getByText(/一致していない商品が2件/)).toBeInTheDocument();
    expect(within(banner).queryByText("金額を比較できません")).not.toBeInTheDocument();
    expect(within(banner).queryByText("税率別の明細合計を比較できません")).not.toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "該当商品を確認する" }));
    expect(onJump).toHaveBeenCalledWith("item-1");
  });
});
