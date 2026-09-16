/**
 * システム管理者ガード解決ユースケース。
 * 既存 requireSystemAdmin のドメイン部分（users 検索→systemAdmins unique→active 判定）。
 */
import { ConvexError } from "convex/values";
import type { SystemAdminReadStore } from "../../domain/systemAdmin/systemAdminStore";
import type { UserDirectoryRead } from "../../domain/groups/userDirectory";

type Deps = {
  admins: Pick<SystemAdminReadStore, "findByUserDocId">;
  users: Pick<UserDirectoryRead, "findByUserId">;
};

export async function requireSystemAdminActor(deps: Deps, tokenIdentifier: string) {
  const user = await deps.users.findByUserId(tokenIdentifier);
  if (!user) throw new ConvexError("システム管理者権限が必要です");
  let admin = null;
  try {
    admin = await deps.admins.findByUserDocId(user.docId);
  } catch {
    throw new ConvexError("システム管理者権限が必要です");
  }
  if (!admin || admin.status !== "active") {
    throw new ConvexError("システム管理者権限が必要です");
  }
  return { user, admin };
}
