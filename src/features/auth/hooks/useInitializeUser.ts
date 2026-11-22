import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
/**
 * Convex 認証確立後に users テーブルを upsert するフック。
 *
 * 使い方:
 *   認証済みユーザーのみアクセスできるコンポーネントのトップレベルで呼び出す。
 *   例: <KakeiboApp /> の直下など。
 *
 * - Convex 認証が確立された直後に 1 回だけ upsertUser を呼ぶ。
 * - userId はサーバー側で identity.tokenIdentifier から解決するため、
 *   クライアントから userId を渡さない。
 * - デフォルトカテゴリはグループ所属後に seed する。
 * - エラーは console.error に記録し、UI をブロックしない。
 *   upsertUser の失敗は initializationError で通知し、
 *   retryInitialization で再試行できる。
 */
export function useInitializeUser() {
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const { isSignedIn } = useAuth();
  const isAuthenticated = isSignedIn === true && isConvexAuthenticated;
  const upsertUser = useMutation(api.users.mutations.upsertUser);
  const seedDefaultCategories = useMutation(api.categories.mutations.seedDefaultCategories);
  const group = useQuery(api.groups.queries.getMyGroup, isAuthenticated ? {} : "skip");
  const hasInitialized = useRef(false);
  const seededGroupIds = useRef(new Set<string>());
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationError, setInitializationError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;
    setIsInitializing(true);

    upsertUser()
      .then(() => {
        hasInitialized.current = true;
        setIsInitializing(false);
        // 前回失敗でエラー画面が出ていても、自動再実行の成功で解除する
        setInitializationError(false);
      })
      .catch((err: unknown) => {
        hasInitialized.current = false; // リトライ許可
        setIsInitializing(false);
        setInitializationError(true);
        console.error("[useInitializeUser] initialization failed:", err);
      });
  }, [isAuthenticated, upsertUser, retryTick]);

  const retryInitialization = () => {
    if (isInitializing || hasInitialized.current) return;
    setInitializationError(false);
    setRetryTick((tick) => tick + 1);
  };

  useEffect(() => {
    if (!isAuthenticated || group === undefined || group === null) {
      return;
    }
    if (seededGroupIds.current.has(group._id)) {
      return;
    }

    seededGroupIds.current.add(group._id);
    seedDefaultCategories().catch((err: unknown) => {
      seededGroupIds.current.delete(group._id);
      console.error("[useInitializeUser] category seed failed:", err);
    });
  }, [group, isAuthenticated, seedDefaultCategories]);

  return { isInitializing, initializationError, retryInitialization };
}
