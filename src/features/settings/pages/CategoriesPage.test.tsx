import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../test/render";
import { CategoriesPage } from "./CategoriesPage";

const { useMutationMock, useQueryMock } = vi.hoisted(() => ({
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    categories: {
      queries: {
        listForSettings: "categories.queries.listForSettings",
      },
      mutations: {
        createCategory: "categories.mutations.createCategory",
        deactivateCategory: "categories.mutations.deactivateCategory",
        reactivateCategory: "categories.mutations.reactivateCategory",
        updateCategory: "categories.mutations.updateCategory",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

describe("CategoriesPage", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    useQueryMock.mockReturnValue([]);
    useMutationMock.mockReturnValue(vi.fn());
  });

  it("h1 見出し「カテゴリ管理」が表示される", () => {
    // Given / When: CategoriesPage を表示する
    renderWithProviders(<CategoriesPage />);

    // Then: ページ h1 見出しとして「カテゴリ管理」が表示される
    expect(screen.getByRole("heading", { name: "カテゴリ管理", level: 1 })).toBeInTheDocument();
  });

  it("CategorySettingsPanel が含まれている", () => {
    // Given / When: CategoriesPage を表示する
    renderWithProviders(<CategoriesPage />);

    // Then: カテゴリを追加するUIが存在する（CategorySettingsPanelが描画されている）
    expect(screen.getByRole("button", { name: "カテゴリを追加" })).toBeInTheDocument();
  });
});
