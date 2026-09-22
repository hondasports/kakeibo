import { api } from "../../../../convex/_generated/api";
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
 */
export function useInitializeUser() {
  const { isAuthenticated } = useConvexAuth();
  const upsertUser = useMutation(api.users.mutations.upsertUser);
  const seedDefaultCategories = useMutation(api.categories.mutations.seedDefaultCategories);
  const group = useQuery(api.groups.queries.getMyGroup, isAuthenticated ? {} : "skip");
  const hasInitialized = useRef(false);
  const seededGroupIds = useRef(new Set<string>());
  const [isInitializing, setIsInitializing] = useState(false);

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
      })
      .catch((err: unknown) => {
        hasInitialized.current = false; // リトライ許可
        setIsInitializing(false);
        console.error("[useInitializeUser] initialization failed:", err);
      });
  }, [isAuthenticated, upsertUser]);

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

  return { isInitializing };
}
