import { MemoryRouter } from "react-router-dom";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR_NAME } from "../lib/legalDocumentMeta";
import { TermsPage } from "./TermsPage";

function renderPage() {
  return renderWithProviders(
    <MemoryRouter>
      <TermsPage />
    </MemoryRouter>,
  );
}

describe("TermsPage", () => {
  it("利用規約の見出しと制定日を表示する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "利用規約" })).toBeInTheDocument();
    expect(screen.getByText(/制定日:/)).toBeInTheDocument();
  });

  it("目次から各節へのアンカーリンクを辿れる", () => {
    renderPage();

    const toc = screen.getByRole("navigation", { name: "目次" });
    const link = within(toc).getByRole("link", { name: "AI解析・自動分類機能" });
    expect(link).toHaveAttribute("href", "#AI解析・自動分類機能");
    expect(document.getElementById("AI解析・自動分類機能")).not.toBeNull();
  });

  it("未改定の間は最終改定日を表示しない", () => {
    renderPage();

    expect(screen.queryByText(/最終改定日/)).not.toBeInTheDocument();
  });

  it("運営者情報とサービス内容を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "運営者" })).toBeInTheDocument();
    const operatorSection = screen.getByRole("heading", { name: "運営者" }).parentElement;
    expect(operatorSection).not.toBeNull();
    expect(within(operatorSection!).getByText(new RegExp(LEGAL_OPERATOR_NAME))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "サービス内容" })).toBeInTheDocument();
    expect(screen.getByText(/家族・グループでのデータ共有/)).toBeInTheDocument();
  });

  it("アカウント登録・管理責任を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "アカウント登録と管理" })).toBeInTheDocument();
    expect(screen.getByText(/アカウント情報の管理責任はユーザー自身にあり/)).toBeInTheDocument();
  });

  it("グループ共有を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "グループ共有" })).toBeInTheDocument();
    expect(
      screen.getByText(/招待メールとログイン中アカウントのメールアドレスが一致する必要があります/),
    ).toBeInTheDocument();
  });

  it("禁止事項を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "禁止事項" })).toBeInTheDocument();
    expect(screen.getByText(/法令または公序良俗に反する行為/)).toBeInTheDocument();
    expect(screen.getByText(/不正アクセス/)).toBeInTheDocument();
    expect(screen.getByText(/本人の同意なくアップロードまたは入力する行為/)).toBeInTheDocument();
  });

  it("ユーザー入力情報の扱いを明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "ユーザー入力情報の扱い" })).toBeInTheDocument();
    expect(screen.getByText(/メモ、金額、カテゴリ、日付等/)).toBeInTheDocument();
  });

  it("AI解析結果を保証しない旨を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "AI解析・自動分類機能" })).toBeInTheDocument();
    expect(
      screen.getByText(/解析結果は参考情報であり、その正確性を保証しません/),
    ).toBeInTheDocument();
    expect(screen.getByText(/外部 API に送信して読み取る/)).toBeInTheDocument();
  });

  it("家計管理・支出記録の正確性を保証しない旨を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "免責事項" })).toBeInTheDocument();
    expect(screen.getByText(/家計管理・支出記録の正確性を保証しません/)).toBeInTheDocument();
  });

  it("退会・アカウント削除はお問い合わせ経由であることを明記する", () => {
    renderPage();

    const section = screen.getByRole("heading", { name: "退会・アカウント削除" }).parentElement;
    expect(section).not.toBeNull();
    expect(within(section!).getByText(new RegExp(LEGAL_CONTACT_EMAIL))).toBeInTheDocument();
    expect(screen.queryByText(/設定画面/)).not.toBeInTheDocument();
  });

  it("利用料金とお問い合わせ先を明記する", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "利用料金" })).toBeInTheDocument();
    expect(screen.getByText(/現時点では無料で提供します/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "お問い合わせ" })).toBeInTheDocument();
  });
});
