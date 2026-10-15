import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useInitializeUser } from "./useInitializeUser";

const { query, mutation, clerkAuth } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  clerkAuth: { isSignedIn: false },
}));
vi.mock("@clerk/react", () => ({ useAuth: () => clerkAuth }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: query,
  useMutation: () => mutation,
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    groups: { queries: { getMyGroup: "group" } },
    users: { mutations: { upsertUser: "upsert" } },
    categories: { mutations: { seedDefaultCategories: "seed" } },
  },
}));

it("Clerkログアウト後はConvexの認証状態が残っていても購読と初期化を止める", () => {
  renderHook(() => useInitializeUser());
  expect(query).toHaveBeenCalledWith("group", "skip");
  expect(mutation).not.toHaveBeenCalled();
});
