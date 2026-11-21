import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWeekSession } from "./useWeekSession";

const { getOrCreateSessionMock } = vi.hoisted(() => ({
  getOrCreateSessionMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: () => getOrCreateSessionMock,
}));

const session = {
  weekStartDate: "2026-06-15",
  weekEndDate: "2026-06-21",
  status: "draft" as const,
};

describe("useWeekSession", () => {
  beforeEach(() => {
    getOrCreateSessionMock.mockReset();
  });

  it("セッション読込に失敗したあと再試行で再取得できる", async () => {
    getOrCreateSessionMock
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(session);

    const { result } = renderHook(() => useWeekSession());

    await waitFor(() => expect(result.current.sessionError).not.toBe(""));
    expect(result.current.weekSession).toBeNull();

    act(() => result.current.retrySession());

    await waitFor(() => expect(result.current.weekSession).not.toBeNull());
    expect(result.current.sessionError).toBe("");
    expect(result.current.isLoading).toBe(false);
    expect(getOrCreateSessionMock).toHaveBeenCalledTimes(2);
  });

  it("再試行も失敗したらエラー表示に戻る", async () => {
    getOrCreateSessionMock.mockRejectedValue(new Error("always fails"));

    const { result } = renderHook(() => useWeekSession());

    await waitFor(() => expect(result.current.sessionError).not.toBe(""));

    act(() => result.current.retrySession());

    await waitFor(() => expect(getOrCreateSessionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sessionError).not.toBe("");
    expect(result.current.weekSession).toBeNull();
  });

  it("再試行の実行中は二重にセッション取得を呼ばない", async () => {
    let resolveRetry: ((value: typeof session) => void) | undefined;
    getOrCreateSessionMock.mockRejectedValueOnce(new Error("network error")).mockImplementationOnce(
      () =>
        new Promise<typeof session>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    const { result } = renderHook(() => useWeekSession());

    await waitFor(() => expect(result.current.sessionError).not.toBe(""));

    act(() => result.current.retrySession());
    expect(result.current.isLoading).toBe(true);

    act(() => result.current.retrySession());
    expect(getOrCreateSessionMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveRetry?.(session);
    });
    await waitFor(() => expect(result.current.weekSession).not.toBeNull());
  });
});
