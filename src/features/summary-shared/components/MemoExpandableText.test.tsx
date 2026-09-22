import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { MemoExpandableText } from "./MemoExpandableText";

describe("MemoExpandableText", () => {
  it("絵文字や結合文字を含む短いメモは切り詰めず全文表示する", () => {
    const memo = "👨‍👩‍👧‍👦 𠮷野家";

    renderWithProviders(<MemoExpandableText memo={memo} />);

    const content = screen.getByTestId("memo-expandable-content");
    expect(content).toHaveTextContent("👨‍👩‍👧‍👦");
    expect(content).toHaveTextContent("𠮷野家");
    expect(screen.queryByTestId("memo-expand-toggle")).not.toBeInTheDocument();
  });

  it("1〜2行のメモは全文を表示しトグルを出さない", () => {
    renderWithProviders(<MemoExpandableText memo="夕食の買い物" />);

    expect(screen.getByTestId("memo-expandable-content")).toHaveTextContent("夕食の買い物");
    expect(screen.queryByTestId("memo-expand-toggle")).not.toBeInTheDocument();
  });

  it("改行3行以上のメモはトグルで展開と折りたたみを切り替える", async () => {
    const user = userEvent.setup();
    const multiLineMemo = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ"].join("\n");

    renderWithProviders(<MemoExpandableText memo={multiLineMemo} />);

    expect(screen.getByTestId("memo-expandable-content").textContent).toContain("あ");
    expect(screen.getByTestId("memo-expandable-content").textContent).toContain("こ");
    expect(screen.getByRole("button", { name: "もっと見る" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "もっと見る" }));
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByRole("button", { name: "もっと見る" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "もっと見る" }));
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByRole("button", { name: "もっと見る" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
