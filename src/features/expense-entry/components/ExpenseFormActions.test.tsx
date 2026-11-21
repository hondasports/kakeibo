import { renderWithProviders } from "../../../test/render";
import { describe, expect, it } from "vitest";
import { ExpenseFormActions } from "./ExpenseFormActions";

function collectCssText(): string {
  const parts: string[] = [];
  document.querySelectorAll("style").forEach((styleEl) => {
    parts.push(styleEl.textContent ?? "");
    const sheet = styleEl.sheet;
    if (sheet) {
      for (const rule of Array.from(sheet.cssRules)) {
        parts.push(rule.cssText);
      }
    }
  });
  return parts.join("\n");
}

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

    const css = collectCssText();
    const className = Array.from(stack!.classList)
      .filter((name) => name.startsWith("css-"))
      .find((name) => new RegExp(`\\.${name}\\s*\\{[^}]*position:[^;}]*sticky`).test(css));
    expect(className).toBeTruthy();

    const mediaRule = (query: string, declarations: string) =>
      new RegExp(
        `@media \\(min-width:\\s*${query}\\)\\s*\\{[^@]*\\.${className}\\s*\\{[^}]*${declarations}`,
      );

    expect(css).toMatch(mediaRule("0px", "bottom:\\s*calc\\("));
    expect(css).toMatch(mediaRule("0px", "position:[^;}]*sticky"));
    expect(css).toMatch(mediaRule("900px", "position:\\s*static"));
    expect(css).toMatch(mediaRule("900px", "bottom:\\s*auto"));
    expect(css).not.toMatch(mediaRule("600px", "position:"));
  });
});
