/**
 * LINE webhook 用のアクティブグループ解決ポート（domain interface）。
 * groups ドメインの membership カーネルへ委譲する薄い読み取り。
 */

export type LineActiveGroupResolution =
  | { status: "resolved"; groupId: string }
  | { status: "no_group" }
  | { status: "unresolved" };

export interface LineActiveGroupResolver {
  resolve(userId: string): Promise<LineActiveGroupResolution>;
}
