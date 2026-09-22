import { api } from "../../../../convex/_generated/api";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { addWeeks, getCurrentWeekStartDate, getWeekEndDate, isFutureWeek } from "../../week";

export type InputPageWeekSession = {
  weekStartDate: string;
  weekEndDate: string;
  status: "draft" | "completed";
  reviewMemo?: string;
};

/**
 * 入力ページで任意週のセッションを取得または作成するカスタムフック。
 * 前週・次週ナビゲーションもサポートする。
 */
export function useInputPageWeek() {
  const userProfile = useQuery(api.users.queries.getUserProfile);
  const getOrCreateSession = useMutation(api.weekSessions.mutations.getOrCreateWeekSession);

  const weeklyStartDay = userProfile?.weeklyStartDay ?? 1;
  const currentWeekStartDate = useMemo(
    () => getCurrentWeekStartDate(weeklyStartDay),
    [weeklyStartDay],
  );
  const [weekStartDate, setWeekStartDate] = useState(() => getCurrentWeekStartDate());
  const [settingsApplied, setSettingsApplied] = useState(false);
  const weekEndDate = getWeekEndDate(weekStartDate);

  const [weekSession, setWeekSession] = useState<InputPageWeekSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (userProfile !== undefined && !settingsApplied) {
    setSettingsApplied(true);
    setWeekStartDate(currentWeekStartDate);
  }

  const [requestedWeekStartDate, setRequestedWeekStartDate] = useState<string | null>(null);
  if (settingsApplied && requestedWeekStartDate !== weekStartDate) {
    setRequestedWeekStartDate(weekStartDate);
    setIsLoading(true);
    setWeekSession(null);
    setSessionError("");
  }

  useEffect(() => {
    if (userProfile === undefined || !settingsApplied) {
      return;
    }
    let cancelled = false;
    getOrCreateSession({ weekStartDate })
      .then((session) => {
        if (cancelled) return;
        setWeekSession(session);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("週次セッション初期化失敗:", err);
        setSessionError("週次セッションの初期化に失敗しました。ページをリロードしてください。");
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getOrCreateSession, settingsApplied, userProfile, weekStartDate]);

  const goToPreviousWeek = () => {
    setWeekStartDate((prev) => addWeeks(prev, -1));
  };

  const goToNextWeek = () => {
    const next = addWeeks(weekStartDate, 1);
    if (!isFutureWeek(next, currentWeekStartDate)) {
      setWeekStartDate(next);
    }
  };

  const isCurrentWeek = weekStartDate === currentWeekStartDate;

  return {
    weekStartDate,
    weekEndDate,
    weekSession,
    setWeekSession,
    sessionError,
    isLoading: isLoading || userProfile === undefined,
    isCurrentWeek,
    goToPreviousWeek,
    goToNextWeek,
  };
}
