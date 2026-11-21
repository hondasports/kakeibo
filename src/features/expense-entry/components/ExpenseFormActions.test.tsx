import {
  collectDocumentCssText,
  findEmotionClassName,
  mediaMinWidthRule,
} from "../../../test/cssText";
import { renderWithProviders } from "../../../test/render";
import { describe, expect, it } from "vitest";
import { ExpenseFormActions } from "./ExpenseFormActions";

function renderActions() {
  return renderWithProviders(
    <ExpenseFormActions
      isMultiMode={false}
      isOverExceeded={false}
      isSubmitting={false}
      onEnterMultiMode={() => {}}
    />,
  );
}

describe("ExpenseFormActions", () => {
  it("保存ボタン行は900px未満でsticky、900px以上でstaticになる", () => {
    const { container } = renderActions();
    const stack = container.firstElementChild;
    expect(stack).not.toBeNull();

    const className = findEmotionClassName(stack!, "position:[^;}]*sticky");
    expect(className).toBeTruthy();

    const css = collectDocumentCssText();
    const mediaRule = (query: string, declarations: string) =>
      mediaMinWidthRule(className!, query, declarations);

    expect(css).toMatch(mediaRule("0px", "bottom:\\s*calc\\("));
    expect(css).toMatch(mediaRule("0px", "position:[^;}]*sticky"));
    expect(css).toMatch(mediaRule("900px", "position:\\s*static"));
    expect(css).toMatch(mediaRule("900px", "bottom:\\s*auto"));
    expect(css).not.toMatch(mediaRule("600px", "position:"));
  });
});
