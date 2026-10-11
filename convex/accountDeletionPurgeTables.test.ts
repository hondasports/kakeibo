// @vitest-environment edge-runtime

import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_USER_PURGE_TABLES } from "../lib/domain/accountDeletion/userDataPurgeStore";
import schema from "./schema";

/**
 * userId(string) を持つのに finalize の purge 対象ではないテーブルと、その理由。
 * 新しい userId 付きテーブルを足したら、purge 対象に加えるかここへ理由付きで追加する。
 */
const USER_ID_TABLES_HANDLED_ELSEWHERE: Record<string, string> = {
  // finalize の最後に users 行を削除する（deps.users.deleteById）。
  users: "finalize 自身が最後に削除する",
  // 退会リクエスト自体。完了状態を残すため削除しない（recipientEmailSnapshot のみ scrub）。
  accountDeletionRequests: "退会リクエスト本体で、completed の記録として保持する",
  // グループ単位のデータ。prepare で退会者を離脱させるか、sole-owner グループごと group deletion が削除する。
  groupMembers: "退会準備のグループ離脱／グループ削除ジョブが削除する",
};

function tablesWithUserIdString(): string[] {
  return Object.entries(schema.tables)
    .filter(([, table]) => {
      const field = (
        table as unknown as { validator: { fields?: Record<string, { kind: string }> } }
      ).validator.fields?.userId;
      return field?.kind === "string";
    })
    .map(([name]) => name)
    .sort();
}

describe("退会 purge 対象テーブルのドリフト防止", () => {
  it("schema の userId(string) 付きテーブルは purge 対象か、理由付き allowlist のどちらかに属する", () => {
    const purged = new Set<string>(ACCOUNT_DELETION_USER_PURGE_TABLES);
    const handled = new Set(Object.keys(USER_ID_TABLES_HANDLED_ELSEWHERE));
    const unaccounted = tablesWithUserIdString().filter(
      (name) => !purged.has(name) && !handled.has(name),
    );
    expect(unaccounted).toEqual([]);
  });

  it("purge 対象と allowlist は実在する userId 付きテーブルだけで、重複しない", () => {
    const actual = new Set(tablesWithUserIdString());
    const purged = [...ACCOUNT_DELETION_USER_PURGE_TABLES];
    const handled = Object.keys(USER_ID_TABLES_HANDLED_ELSEWHERE);
    for (const name of [...purged, ...handled]) expect(actual.has(name)).toBe(true);
    expect(purged.filter((name) => handled.includes(name))).toEqual([]);
  });

  it("lineNotificationJobs は linkId 参照先の lineAccountLinks より先に削除する", () => {
    const order: readonly string[] = ACCOUNT_DELETION_USER_PURGE_TABLES;
    expect(order.indexOf("lineNotificationJobs")).toBeLessThan(order.indexOf("lineAccountLinks"));
    expect(order.indexOf("lineNotificationEvents")).toBeLessThan(order.indexOf("lineAccountLinks"));
  });
});
