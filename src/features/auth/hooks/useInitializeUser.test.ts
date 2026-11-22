import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useInitializeUser } from "./useInitializeUser";

const { query, mutation, clerkAuth, convexAuth } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  clerkAuth: { isSignedIn: false },
  convexAuth: { isAuthenticated: true },
}));
vi.mock("@clerk/react", () => ({ useAuth: () => clerkAuth }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => convexAuth,
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

beforeEach(() => {
  clerkAuth.isSignedIn = false;
  convexAuth.isAuthenticated = true;
  query.mockReset();
  mutation.mockReset();
});

it("Clerkログアウト後はConvexの認証状態が残っていても購読と初期化を止める", () => {
  renderHook(() => useInitializeUser());
  expect(query).toHaveBeenCalledWith("group", "skip");
  expect(mutation).not.toHaveBeenCalled();
});

it("初期化失敗後に認証が戻ると自動再実行が走り、成功でエラーが解除される", async () => {
  clerkAuth.isSignedIn = true;
  mutation.mockRejectedValueOnce(new Error("upsert failed")).mockResolvedValue(undefined);
  const { result, rerender } = renderHook(() => useInitializeUser());
  await waitFor(() => expect(result.current.initializationError).toBe(true));

  // Convexの認証が false → true に戻ると effect が再実行される
  convexAuth.isAuthenticated = false;
  rerender();
  convexAuth.isAuthenticated = true;
  rerender();

  await waitFor(() => expect(result.current.initializationError).toBe(false));
  expect(mutation).toHaveBeenCalledTimes(2);
});

it("retryInitialization で再試行して成功すればエラーが解除される", async () => {
  clerkAuth.isSignedIn = true;
  mutation.mockRejectedValueOnce(new Error("upsert failed")).mockResolvedValue(undefined);
  const { result } = renderHook(() => useInitializeUser());
  await waitFor(() => expect(result.current.initializationError).toBe(true));

  act(() => result.current.retryInitialization());

  await waitFor(() => expect(result.current.initializationError).toBe(false));
  expect(mutation).toHaveBeenCalledTimes(2);
});
