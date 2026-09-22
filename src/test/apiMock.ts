/**
 * `convex/_generated/api` の vi.mock 用ヘルパー。
 * 実 api と同様に任意のパスアクセスを値として返しつつ、
 * overrides に指定したパスだけセンチネル値を返す。
 * useQuery/useMutation のモックがクエリ参照で分岐するテストで使う。
 */
export function apiMockWith(overrides: Record<string, unknown>): unknown {
  const build = (path: string[]): unknown =>
    new Proxy(() => "", {
      get: (_target, prop) => {
        const nextPath = [...path, String(prop)];
        const key = nextPath.join(".");
        return key in overrides ? overrides[key] : build(nextPath);
      },
    });
  return build([]);
}
