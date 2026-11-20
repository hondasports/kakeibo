/**
 * LINE webhook 用のアクティブグループ解決ポート（domain interface）。
 * groups ドメインの membership カーネルへ委譲する薄い読み取り。
 */

/** グループ解決 status の全値。API validator はこの並びに合わせる。 */
export const LINE_GROUP_RESOLUTION_STATUSES = ["resolved", "no_group", "unresolved"] as const;

export type LineGroupResolutionStatus = (typeof LINE_GROUP_RESOLUTION_STATUSES)[number];

export type LineActiveGroupResolution =
  | { status: "resolved"; groupId: string }
  | { status: "no_group" }
  | { status: "unresolved" };

export interface LineActiveGroupResolver {
  resolve(userId: string): Promise<LineActiveGroupResolution>;
}
