import { MemoryRouter } from "react-router-dom";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { LegalDocumentLayout, LegalSection } from "./LegalDocumentLayout";

function renderLayout(props?: { lastRevisedDate?: string }) {
  return renderWithProviders(
    <MemoryRouter>
      <LegalDocumentLayout
        effectiveDate="2026年6月26日"
        lastRevisedDate={props?.lastRevisedDate}
        title="利用規約"
      >
        <LegalSection title="運営者">運営者情報</LegalSection>
      </LegalDocumentLayout>
    </MemoryRouter>,
  );
}

describe("LegalDocumentLayout", () => {
  it("改定済みなら最終改定日を併記する", () => {
    renderLayout({ lastRevisedDate: "2026年10月1日" });

    expect(screen.getByText(/最終改定日: 2026年10月1日/)).toBeInTheDocument();
  });

  it("フラグメント付きで開いたとき対象の節へスクロールする", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.location.hash = "#運営者";

    renderLayout();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    window.location.hash = "";
  });
});
