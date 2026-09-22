import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ReviewDialogActions } from "./ReviewDialogActions";
const props = {
  reviewError: "",
  busy: false,
  requiredCount: 0,
  recommendationCount: 0,
  totalOnly: false,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  onReviewRequired: vi.fn(),
};
describe("ReviewDialogActions", () => {
  it("必須修正があれば保存せず修正へ案内する", async () => {
    render(<ReviewDialogActions {...props} requiredCount={1} />);
    await userEvent.click(screen.getByRole("button", { name: "修正が必要な項目へ" }));
    expect(props.onReviewRequired).toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
  it("必須修正とチェック不一致の合計をPC表示でも件数に使う", () => {
    render(<ReviewDialogActions {...props} requiredCount={1} checkMismatchCount={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("保存前に修正が必要：2件");
    expect(screen.getByText("修正必須 2件")).toBeInTheDocument();
  });
  it("保存方法に対応した主ボタンだけを表示する", async () => {
    render(<ReviewDialogActions {...props} totalOnly />);
    expect(screen.queryByRole("button", { name: "この内容で保存" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "レシート合計だけ保存" }));
    expect(props.onSubmit).toHaveBeenCalled();
  });
  it("通信エラーと入力保持を伝え、再試行できる", () => {
    render(<ReviewDialogActions {...props} reviewError="接続に失敗しました。" />);
    expect(screen.getByRole("alert")).toHaveTextContent("入力は残っています");
    expect(screen.getByRole("button", { name: "この内容で保存" })).toBeEnabled();
  });
  it("税込・税抜の矛盾件数を具体的に表示する", () => {
    render(<ReviewDialogActions {...props} recommendationCount={2} basisConflictItemCount={4} />);
    expect(screen.getByRole("status")).toHaveTextContent("税込・税抜の不一致 4件");
    expect(screen.getByText("税込・税抜の不一致 4件")).toBeInTheDocument();
  });
});
