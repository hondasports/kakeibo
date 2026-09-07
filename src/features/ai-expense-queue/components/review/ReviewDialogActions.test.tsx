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
});
