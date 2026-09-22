import { api } from "../../../../convex/_generated/api";
import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
export type WeekSession = {
  weekStartDate: string;
  weekEndDate: string;
  status: "draft" | "completed";
  reviewMemo?: string;
};

/**
 * 今週のセッションを取得または作成するカスタムフック。
 *
 * getOrCreateCurrentWeekSession は副作用を持つ mutation のため useQuery ではなく useMutation を使用。
 * useEffect + useCallback でマウント時に一度だけ実行し、結果を local state に保持する。
 * Strict Mode での二重実行については、mutation の冪等性（同じ週のセッションは1回のみ作成）で担保している。
 */
export function useWeekSession() {
  const getOrCreateSession = useMutation(api.weekSessions.mutations.getOrCreateCurrentWeekSession);
  const [weekSession, setWeekSession] = useState<WeekSession | null>(null);
  const [sessionError, setSessionError] = useState("");

  const initSession = useCallback(() => {
    getOrCreateSession()
      .then(setWeekSession)
      .catch((err: unknown) => {
        console.error("週次セッション初期化失敗:", err);
        setSessionError("週次セッションの初期化に失敗しました。ページをリロードしてください。");
      });
  }, [getOrCreateSession]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  return { weekSession, setWeekSession, sessionError };
}
