import { MemoryRouter } from "react-router-dom";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR_NAME } from "../lib/legalDocumentMeta";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  );
}

describe("PrivacyPolicyPage", () => {
  it("プライバシーポリシーの見出しと制定日を表示する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "プライバシーポリシー" })).toBeInTheDocument();
    expect(screen.getByText(/制定日:/)).toBeInTheDocument();
  });

  it("目次から各節へのアンカーリンクを辿れる", () => {
    renderPage();

    const toc = screen.getByRole("navigation", { name: "目次" });
    const link = within(toc).getByRole("link", { name: "お問い合わせ先" });
    expect(link).toHaveAttribute("href", "#お問い合わせ先");
    expect(document.getElementById("お問い合わせ先")).not.toBeNull();
  });

  it("運営者情報を表示する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "運営者" })).toBeInTheDocument();
    const operatorSection = screen.getByRole("heading", { name: "運営者" }).parentElement;
    expect(operatorSection).not.toBeNull();
    expect(within(operatorSection!).getByText(new RegExp(LEGAL_OPERATOR_NAME))).toBeInTheDocument();
    expect(within(operatorSection!).getByText(new RegExp(LEGAL_CONTACT_EMAIL))).toBeInTheDocument();
  });

  it("Googleログインで取得する情報と利用目的を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "取得する情報" })).toBeInTheDocument();
    expect(screen.getByText(/Googleログインにより取得されるメールアドレス/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "利用目的" })).toBeInTheDocument();
    expect(screen.getByText(/認証、アカウント管理/)).toBeInTheDocument();
    expect(screen.getByText(/家族・グループ内でのデータ共有・同期/)).toBeInTheDocument();
  });

  it("Gmail / Drive / Calendar 等を取得しない旨を明記する", () => {
    renderPage();

    expect(
      screen.getByText(/Gmail \/ Google Drive \/ Google Calendar 等の内容は取得しません/),
    ).toBeInTheDocument();
  });

  it("レシート画像の外部API送信とグループ共有を明記する", () => {
    renderPage();

    const receiptSection = screen.getByRole("heading", {
      name: "レシート画像の外部API送信",
    }).parentElement;
    expect(receiptSection).not.toBeNull();
    expect(within(receiptSection!).getByText(/長期保存しません/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "グループ共有" })).toBeInTheDocument();
  });

  it("Clerk / Google / Vercel / Convex / OpenAI の外部委託を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "外部サービスへの委託" })).toBeInTheDocument();
    expect(screen.getByText(/Clerk（認証・アカウント管理）/)).toBeInTheDocument();
    expect(screen.getByText(/Google（OAuth 認証）/)).toBeInTheDocument();
    expect(screen.getByText(/Vercel（ホスティング）/)).toBeInTheDocument();
    expect(screen.getByText(/Convex（データベース・バックエンド）/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI（レシート画像の AI 解析/)).toBeInTheDocument();
  });

  it("国外移転と保存期間を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "国外への情報移転" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "保存期間" })).toBeInTheDocument();
  });

  it("お問い合わせ先を表示する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "お問い合わせ先" })).toBeInTheDocument();
  });
});
