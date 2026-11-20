import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DifferenceDisplay } from "./DifferenceDisplay";

describe("DifferenceDisplay", () => {
  it("差額を符号付き円表記で表示する", () => {
    render(<DifferenceDisplay difference={-1234} sourceAmount={5000} />);
    expect(screen.getByLabelText("差額")).toHaveTextContent("−1,234円");
  });

  it("プラスの差額は + 付きで表示する", () => {
    render(<DifferenceDisplay difference={500} sourceAmount={5000} />);
    expect(screen.getByLabelText("差額")).toHaveTextContent("+500円");
  });

  it("差額0は符号なしの 0円 と表示する", () => {
    render(<DifferenceDisplay difference={0} sourceAmount={5000} />);
    expect(screen.getByLabelText("差額")).toHaveTextContent("0円");
  });

  it("差額が不明または入力元が0以下なら何も表示しない", () => {
    const { container } = render(<DifferenceDisplay difference={null} sourceAmount={5000} />);
    expect(container).toBeEmptyDOMElement();
    const { container: zeroContainer } = render(
      <DifferenceDisplay difference={100} sourceAmount={0} />,
    );
    expect(zeroContainer).toBeEmptyDOMElement();
  });
});
